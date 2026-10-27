import Anthropic, { BadRequestError } from "@anthropic-ai/sdk";
import type { Game } from "../games/types";
import type { Conversation } from "./types";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type MessageCreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type TextBlock = Anthropic.Beta.Messages.BetaTextBlock;
// 種類を問わず扱うコンテンツブロック
type Block = { type: string } & Record<string, unknown>;

/**
 * Claude API にメッセージを送る
 * signal で中止されたら、送っている途中のリクエストを止める
 */
export type CreateMessage = (
	params: MessageCreateParams,
	signal: AbortSignal,
) => Promise<BetaMessage>;

/**
 * Claude API のファイルの保管場所
 */
export interface ClaudeFiles {
	/**
	 * ファイルをアップロードして、ファイルのIDを返す
	 * signal で中止されたら、アップロードを止める
	 */
	upload(file: File, signal: AbortSignal): Promise<string>;
	delete(fileId: string): Promise<void>;
}

/**
 * 質問
 */
export interface Question {
	text: string;
	// 質問に添えたファイル
	// 本文は見出しでファイルを指す
	files: AttachedFile[];
}

/**
 * Claude API にアップロードした、質問に添えるファイル
 * 画像は image ブロック、PDF とテキストは document ブロックで渡す
 */
export interface AttachedFile {
	label: string;
	kind: "image" | "document";
	fileId: string;
	filename: string;
}

/**
 * 質問を受けた場所
 */
export interface Place {
	// Discord のサーバーの名前
	serverName: string;
	// サーバーでの Bot の表示名
	botName: string;
	game: Game;
}

/**
 * 質問への答え
 */
export type Answer =
	| {
			refused: false;
			text: string;
			// 出典のURL
			sources: string[];
			// 答えた後の会話
			conversation: Conversation;
	  }
	| { refused: true };

function systemPrompt(place: Place, hasServerTools: boolean): string {
	return `あなたはDiscordサーバー「${place.serverName}」のBot「${place.botName}」として、同じゲームを遊ぶメンバーにルームのチャットで応じます。

## 前提
- ルームのゲーム: 会話のシステムメッセージで伝わる
  - 「Free」: ゲームが決まっていない
- 出典: 投稿時に本文の後へ自動で付く

## 発言の読み方
- どのゲームの話か決まらない発言: ルームのゲームの話として読む

## 調べ方
- 確かめる対象: ゲーム固有の事実、本文で使う名称
- 確かめ方: 複数の情報源をWeb検索する
${hasServerTools ? "- サーバー固有の事実: サーバーのツールで確かめる\n" : ""}
## 文章
- 優先: わかりやすく短いこと
- 内容: 必要なことだけ
- 文体: です・ます調の話し言葉
- 口調: 先輩が後輩に話すときくらい
- 文末: 言い切りの形
- 語: 読み手の知っている語
- 名称: 正式名（日本語版があれば日本語版での名前）
- 丸括弧: 補足は全角、同じものの言い換えは半角
- 書式: DiscordのMarkdownを内容に合わせて使う`;
}

// 要約の指示
// ツールを渡していると、要約の途中でツールを呼んで要約に失敗することがあるので、ツールを呼ばないように指示する
// 指示はドキュメントの例に合わせる
// 指示は既定の指示を置き換える
const SUMMARY_INSTRUCTIONS =
	"Summarize the transcript inside <summary></summary> tags. Include relevant information in the summary for continuing the task in the next context window. Do not call any tools while writing this summary; respond with text only.";
// 長い応答の中に置くキャッシュブレークポイントの間隔（ブロック数）
// キャッシュはブレークポイントから20ブロック前までを探すので、それより短い間隔で置く
const BREAKPOINT_INTERVAL = 15;
// 長い応答の中に置けるキャッシュブレークポイントの数
// 上限の4から、システムプロンプトと会話の末尾の分を除く
const MAX_INTERMEDIATE_BREAKPOINTS = 2;
// MCP コネクタでつなぐ、サーバー固有の情報を返す MCP サーバーの名前
const MCP_SERVER_NAME = "community";
// 中断からの再開の上限
// 値は Claude API のドキュメントの pause_turn の例に合わせる
const MAX_CONTINUATIONS = 5;

/**
 * Claude API とのやり取り
 */
export interface ClaudeApi {
	createMessage: CreateMessage;
	files: ClaudeFiles;
}

/**
 * API キーを使って、Claude API とやり取りする関数を作る
 */
export function claudeApi(apiKey: string): ClaudeApi {
	const client = new Anthropic({ apiKey });
	return {
		createMessage: (params, signal) => client.beta.messages.create(params, { signal }),
		files: {
			upload: async (file, signal) => (await client.files.upload({ file }, { signal })).id,
			delete: async (fileId) => {
				await client.files.delete(fileId);
			},
		},
	};
}

/**
 * ルームのゲームについての質問に Claude で答える
 */
export class Claude {
	constructor(
		private createMessage: CreateMessage,
		private model: string,
		// サーバー固有の情報を返す MCP サーバーの URL
		private mcpUrl?: string,
	) {}

	/**
	 * 会話に質問を追記して答える
	 * 答えを最後まで受け取れなかったら例外を投げる
	 * signal で中止されたら、答えるのをやめて例外を投げる
	 */
	async answer(
		conversation: Conversation,
		question: Question,
		place: Place,
		signal: AbortSignal,
	): Promise<Answer> {
		const messages = withQuestion(conversation, question, place.game);
		const replies: BetaMessageParam[] = [];
		let mcpUrl = this.mcpUrl;

		for (let continuation = 0; continuation <= MAX_CONTINUATIONS; continuation++) {
			signal.throwIfAborted();
			let response: BetaMessage;
			try {
				response = await this.createMessage(
					this.params(place, [...messages, ...replies], mcpUrl),
					signal,
				);
			} catch (error) {
				// MCP サーバーにつながらなければ、MCP サーバーなしで答える
				// つながらないのはツールの一覧を問い合わせるときで、一覧を記録していない会話なので、そのまま送り直せる
				if (!mcpUrl || !isMcpServerUnreachable(error)) throw error;
				console.warn("[Claude] MCP server unreachable, answering without it:", error.message);
				mcpUrl = undefined;
				response = await this.createMessage(
					this.params(place, [...messages, ...replies], mcpUrl),
					signal,
				);
			}
			signal.throwIfAborted();
			console.log(`[Claude] Usage of ${response.model}:`, JSON.stringify(response.usage));
			if (response.input_transformations?.length) {
				console.warn("[Claude] Input transformed:", JSON.stringify(response.input_transformations));
			}

			if (response.stop_reason === "refusal") return { refused: true };

			replies.push({ role: "assistant", content: response.content });

			// サーバーツールの実行が中断されたら、そのまま送り直すと続きから再開する
			if (response.stop_reason === "pause_turn") continue;
			if (response.stop_reason !== "end_turn") {
				throw new Error(`Answer stopped by ${response.stop_reason}`);
			}

			const final = finalTextBlocks(replies.flatMap(blocksOf));
			const text = final
				.map((block) => block.text)
				.join("")
				.trim();
			if (!text) throw new Error("Answer has no text");

			return {
				refused: false,
				text,
				sources: [...new Set([...final.flatMap(citedSources), ...fetchedPages(replies)])],
				conversation: nextConversation(messages, replies, place.game),
			};
		}

		throw new Error(`No answer within ${MAX_CONTINUATIONS} continuations`);
	}

	private params(
		place: Place,
		messages: BetaMessageParam[],
		mcpUrl: string | undefined,
	): MessageCreateParams {
		return {
			model: this.model,
			max_tokens: 16000,
			betas: [
				"server-side-fallback-2026-07-01",
				"compact-2026-01-12",
				"thinking-binding-controls-2026-08-01",
				// MCP サーバーが返したツールの一覧を会話に記録し、会話の途中でツールが変わらないようにする
				// 記録した一覧を含む会話は、この beta なしでは送れないので、MCP サーバーを使わないときも付ける
				"mcp-client-2026-09-15",
			],
			fallbacks: "default",
			output_config: { effort: "low" },
			// 保存した会話が書き換わっていても、合わなくなった思考だけを捨てて答えを続ける
			thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
			// 会話の末尾に自動でキャッシュブレークポイントを置く
			cache_control: { type: "ephemeral" },
			context_management: {
				edits: [
					{
						// 会話が既定の量を超えたら、サーバー側で古いやり取りを要約する
						type: "compact_20260112",
						instructions: SUMMARY_INSTRUCTIONS,
					},
				],
			},
			system: [
				// システムプロンプトはサーバー名と Bot の表示名が変わるまで同じなので、1時間キャッシュする
				{
					type: "text",
					text: systemPrompt(place, mcpUrl !== undefined),
					cache_control: { type: "ephemeral", ttl: "1h" },
				},
			],
			// 検索するかはシステムプロンプトで導く
			// 検索と取得の回数は制限しない
			tools: [
				// 検索結果は小さいので直接読ませる
				// 直接読ませると、出典が本文に結び付いて返る
				{ type: "web_search_20260318", name: "web_search", allowed_callers: ["direct"] },
				// ゲームの Wiki のページは大きいので、コード実行で必要な部分だけを抜き出して読ませる
				{ type: "web_fetch_20260318", name: "web_fetch" },
				...(mcpUrl ? [{ type: "mcp_toolset" as const, mcp_server_name: MCP_SERVER_NAME }] : []),
			],
			...(mcpUrl && {
				mcp_servers: [{ type: "url" as const, url: mcpUrl, name: MCP_SERVER_NAME }],
			}),
			messages: withIntermediateBreakpoints(messages),
		};
	}
}

/**
 * MCP サーバーにつながらなかったエラーか
 * エラーにコードが付かないので、メッセージで見分ける
 */
function isMcpServerUnreachable(error: unknown): error is BadRequestError {
	return (
		error instanceof BadRequestError &&
		error.message.includes("Error while communicating with MCP server")
	);
}

/**
 * 会話に質問を追記したメッセージ
 * ファイルは見出しを付けて本文より前に置く
 * ルームのゲームが会話で伝えたゲームと違えば、質問の直後にシステムメッセージで伝える
 */
function withQuestion(
	conversation: Conversation,
	question: Question,
	game: Game,
): BetaMessageParam[] {
	const content: string | BetaContentBlockParam[] =
		question.files.length === 0
			? question.text
			: [
					...question.files.flatMap((file): BetaContentBlockParam[] => [
						{ type: "text", text: `${file.label}:` },
						fileBlock(file),
					]),
					{ type: "text", text: question.text },
				];
	const messages: BetaMessageParam[] = [...conversation.messages, { role: "user", content }];
	if (conversation.gameId !== game.id) {
		messages.push({ role: "system", content: `ルームのゲーム: ${game.name}` });
	}
	return messages;
}

function fileBlock({ kind, fileId, filename }: AttachedFile): BetaContentBlockParam {
	const source = { type: "file", file_id: fileId } as const;
	return kind === "image"
		? { type: "image", source }
		: { type: "document", source, title: filename };
}

/**
 * 答えた後の会話
 * 応答の中で要約されたら、要約から後だけを持つ（API は要約から後だけを読む）
 * 要約されたシステムメッセージは効かなくなるので、要約の後はゲームを伝えていない状態にする
 */
function nextConversation(
	messages: BetaMessageParam[],
	replies: BetaMessageParam[],
	game: Game,
): Conversation {
	const index = replies.findLastIndex((message) => blocksOf(message).some(isSummary));
	if (index < 0) return { gameId: game.id, messages: [...messages, ...replies] };

	const content = blocksOf(replies[index]);
	const start = content.findLastIndex(isSummary);
	return {
		gameId: null,
		messages: [
			{ role: "assistant", content: content.slice(start) as BetaContentBlockParam[] },
			...replies.slice(index + 1),
		],
	};
}

/**
 * 要約のブロックか
 * 要約に失敗したブロックは content が null になる
 */
function isSummary(block: Block): boolean {
	return block.type === "compaction" && block.content != null;
}

function blocksOf(message: BetaMessageParam): Block[] {
	return typeof message.content === "string"
		? [{ type: "text", text: message.content }]
		: (message.content as unknown as Block[]);
}

/**
 * 最後のツールの実行より後の本文
 * ツールの実行の合間の本文は途中経過なので、答えに含めない
 */
function finalTextBlocks(blocks: Block[]): TextBlock[] {
	const lastToolIndex = blocks.findLastIndex(
		(block) =>
			block.type !== "text" && block.type !== "thinking" && block.type !== "redacted_thinking",
	);
	return blocks
		.slice(lastToolIndex + 1)
		.filter((block): block is Block & TextBlock => block.type === "text");
}

/**
 * 答えのために取得したページ
 * 取得したページはコード実行で抜き出してから読むので、本文の出典には結び付かない
 */
function fetchedPages(replies: BetaMessageParam[]): string[] {
	return replies.flatMap(blocksOf).flatMap((block) => {
		if (block.type !== "web_fetch_tool_result") return [];
		const result = block.content as Anthropic.Beta.Messages.BetaWebFetchToolResultBlock["content"];
		return result.type === "web_fetch_result" ? [result.url] : [];
	});
}

/**
 * 最後の Claude の応答の中に、キャッシュブレークポイントを一定の間隔で置いた会話
 * 引用の付いた答えは文ごとにブロックが分かれ、1回の応答で20ブロックを超えることがある
 * ブレークポイントを足しても会話の書き換えにはならないので、送るときだけ足す
 */
function withIntermediateBreakpoints(messages: BetaMessageParam[]): BetaMessageParam[] {
	const end = messages.findLastIndex((message) => message.role === "assistant");
	if (end < 0) return messages;
	let start = end;
	while (start > 0 && messages[start - 1].role === "assistant") start--;

	const positions = messages
		.slice(start, end + 1)
		.flatMap((message, offset) =>
			message.role !== "assistant" || typeof message.content === "string"
				? []
				: message.content.map((_, blockIndex) => ({ messageIndex: start + offset, blockIndex })),
		);

	const result = [...messages];
	for (let n = 1; n <= MAX_INTERMEDIATE_BREAKPOINTS; n++) {
		// 思考のブロックにはブレークポイントを置けないので、手前のブロックに置く
		const position = positions
			.slice(0, n * BREAKPOINT_INTERVAL)
			.findLast(({ messageIndex, blockIndex }) => {
				const block = blocksOf(result[messageIndex])[blockIndex];
				return block.type !== "thinking" && block.type !== "redacted_thinking";
			});
		if (!position || positions.length <= n * BREAKPOINT_INTERVAL) break;

		const content = [...(result[position.messageIndex].content as BetaContentBlockParam[])];
		content[position.blockIndex] = {
			...content[position.blockIndex],
			cache_control: { type: "ephemeral" },
		} as BetaContentBlockParam;
		result[position.messageIndex] = { role: "assistant", content };
	}
	return result;
}

/**
 * 本文が引用した検索結果
 */
function citedSources(block: TextBlock): string[] {
	return (block.citations ?? []).flatMap((citation) =>
		citation.type === "web_search_result_location" ? [citation.url] : [],
	);
}
