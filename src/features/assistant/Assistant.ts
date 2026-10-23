import {
	type Attachment,
	cleanContent,
	type Message,
	MessageFlags,
	type Snowflake,
} from "discord.js";
import { DISCORD_LIMITS, TIME } from "../../constants";
import type { Room } from "../rooms/Room";
import type { Answer, AttachedFile, Claude, ClaudeFiles } from "./Claude";
import type { ConversationStore } from "./ConversationStore";
import type { FileStore } from "./FileStore";

// 入力中の表示は約10秒で消えるので、その前に送り直す
const TYPING_INTERVAL = 8 * TIME.SECOND;

// Claude API が読める添付ファイルの形式
// 画像は image ブロック、PDF とテキストは document ブロックで渡す
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const PDF_TYPE = "application/pdf";
// document ブロックが受け付けるテキストの形式
// CSV や Markdown などのテキストも、この形式にすれば読める
const TEXT_TYPE = "text/plain";
// 画像の長辺の上限
// 1回のリクエストに画像が20枚を超えて入ると、API はどの画像も長辺2000px以下でないと受け付けない
// 会話の画像は質問のたびに送り直すので、すべての画像をこの上限に収める
const MAX_IMAGE_EDGE = 2000;

type Kind = AttachedFile["kind"];

const FAILED_MESSAGE = "答えを用意できませんでした\n少し待ってからもう一度聞いてください";
const REFUSED_MESSAGE = "この質問には答えられません";

/**
 * ルームで Bot に聞かれたら、ゲームの質問に答える
 * 会話と、質問の添付ファイルをアップロードしたファイルはルームごとに持ち、ルームを削除すると一緒に削除する
 */
export class Assistant {
	// ルームごとの質問の待ち行列
	// last は最後に受け付けた質問の処理
	// controller はルームの質問をまとめて中止するもの
	// 答えるたびに会話を読んで書き戻すので、同じルームの質問には1つずつ答える
	private queues = new Map<Snowflake, { last: Promise<void>; controller: AbortController }>();

	constructor(
		private claude: Claude,
		private store: ConversationStore,
		private files: ClaudeFiles,
		private fileStore: FileStore,
	) {}

	/**
	 * ルームのメッセージが Bot への質問なら、ルームで受け付けた順に答える
	 */
	respond(message: Message<true>, room: Room): Promise<void> {
		const roomId = room.id;
		if (!roomId || !isToBot(message)) return Promise.resolve();

		const queue = this.queues.get(roomId) ?? {
			last: Promise.resolve(),
			controller: new AbortController(),
		};
		const { signal } = queue.controller;
		const current = queue.last.then(() => this.answer(message, room, signal));
		queue.last = current;
		this.queues.set(roomId, queue);
		void current.then(() => {
			if (this.queues.get(roomId)?.last === current) this.queues.delete(roomId);
		});
		return current;
	}

	/**
	 * ルームの会話とファイルを削除する
	 * 答えている途中の質問と待っている質問は、投稿する場所がなくなるので中止する
	 */
	forget(roomId: Snowflake): void {
		this.queues.get(roomId)?.controller.abort();
		this.queues.delete(roomId);
		this.store.delete(roomId);
		this.deleteFiles(this.fileStore.removeAll(roomId));
	}

	/**
	 * 質問に答えて、答えを投稿する
	 * 会話に残らなかった質問の添付ファイルは削除する
	 * 例外は投げない
	 */
	private async answer(question: Message<true>, room: Room, signal: AbortSignal): Promise<void> {
		const roomId = room.id;
		if (!roomId || signal.aborted || !(await isQuestion(question))) return;

		const stopTyping = keepTyping(question);
		const fileIds: string[] = [];
		let content: string;
		try {
			const { text, attachments } = await readQuestion(question);
			const files: AttachedFile[] = [];
			for (const { label, kind, attachment } of attachments) {
				const fileId = await this.files.upload(await download(attachment, kind, signal), signal);
				// ファイルはアップロードした直後から記録し、答えられなくても削除できるようにする
				this.fileStore.add(roomId, fileId);
				fileIds.push(fileId);
				files.push({ label, kind, fileId, filename: attachment.name });
			}

			const conversation = this.store.get(roomId) ?? { gameId: null, messages: [] };
			const answer = await this.claude.answer(
				conversation,
				{ text, files },
				{
					serverName: question.guild.name,
					botName: question.guild.members.me?.displayName ?? question.client.user.displayName,
					game: room.game,
				},
				signal,
			);
			if (answer.refused) this.deleteFiles(this.fileStore.remove(roomId, fileIds));
			else this.store.set(roomId, answer.conversation);
			content = formatAnswer(answer);
		} catch (error) {
			this.deleteFiles(this.fileStore.remove(roomId, fileIds));
			if (signal.aborted) return;
			console.error("[Assistant] Failed to answer:", error);
			content = FAILED_MESSAGE;
		} finally {
			stopTyping();
		}

		try {
			await post(question, content);
		} catch (error) {
			console.error("[Assistant] Failed to post answer:", error);
		}
	}

	/**
	 * Claude API からファイルを削除する
	 * 削除できなかったファイルはログに残す
	 */
	private deleteFiles(fileIds: string[]): void {
		for (const fileId of fileIds) {
			this.files.delete(fileId).catch((error: unknown) => {
				console.error(`[Assistant] Failed to delete file ${fileId}:`, error);
			});
		}
	}
}

/**
 * Bot に向けたメッセージか
 * 本文で Bot をメンションしたものと、Bot の投稿に Bot へ通知して返信したものが Bot に向けたメッセージ
 * Bot へ通知する返信は、本文にメンションがなくても Bot がメンションに入る
 */
function isToBot(message: Message<true>): boolean {
	const botId = message.client.user.id;
	return (
		message.mentions.parsedUsers.has(botId) ||
		(message.mentions.repliedUser?.id === botId && message.mentions.users.has(botId))
	);
}

/**
 * Bot に向けたメッセージが質問か
 * Bot の投稿への返信は、答えへの返信だけが質問
 * Bot がコマンドの応答のほかに投稿するのは答えだけ
 */
async function isQuestion(message: Message<true>): Promise<boolean> {
	if (message.mentions.parsedUsers.has(message.client.user.id)) return true;
	const target = await message.fetchReference().catch(() => null);
	return target !== null && !target.interactionMetadata;
}

/**
 * 質問の本文と添付ファイルを読む
 * 本文は「表示名: 本文」の形にし、発言に付いた添付ファイルを見出しの行「[添付1: ファイル名]」で示す
 * Bot 以外の発言への返信なら、返信先を「> 」で始まる行で前に付け、返信先の添付ファイルも添える
 * Claude が読めない形式の添付ファイルは添えない
 */
async function readQuestion(
	question: Message<true>,
): Promise<{ text: string; attachments: { label: string; kind: Kind; attachment: Attachment }[] }> {
	const attachments: { label: string; kind: Kind; attachment: Attachment }[] = [];
	const describe = (message: Message<true>): string => {
		const lines = [`${nameOf(message)}: ${textOf(message)}`];
		for (const attachment of message.attachments.values()) {
			const kind = kindOf(attachment);
			if (!kind) continue;
			const label = `添付${attachments.length + 1}`;
			attachments.push({ label, kind, attachment });
			lines.push(`[${label}: ${attachment.name}]`);
		}
		return lines.join("\n");
	};

	const lines: string[] = [];
	if (question.reference?.messageId) {
		const target = await question.fetchReference().catch(() => null);
		if (target && target.author.id !== question.client.user.id) {
			lines.push(
				...describe(target)
					.split("\n")
					.map((line) => `> ${line}`),
			);
		}
	}
	lines.push(describe(question));
	return { text: lines.join("\n"), attachments };
}

/**
 * 添付ファイルを Claude に渡すときの種類
 * Claude が読めない形式なら null
 */
function kindOf(attachment: Attachment): Kind | null {
	const type = mediaTypeOf(attachment.contentType);
	if (IMAGE_TYPES.has(type)) return "image";
	if (type === PDF_TYPE || type.startsWith("text/")) return "document";
	return null;
}

/**
 * Content-Type からパラメーターを除いたメディアタイプ
 */
function mediaTypeOf(contentType: string | null): string {
	return contentType?.split(";")[0].trim() ?? "";
}

/**
 * 添付ファイルを、Claude API にアップロードする形で取得する
 * 長辺が上限を超える画像は、Discord のメディアプロキシで縦横比を保って上限まで縮める
 * テキストは、document ブロックが受け付ける text/plain にする
 * signal で中止されたら、取得を止める
 */
async function download(attachment: Attachment, kind: Kind, signal: AbortSignal): Promise<File> {
	const { width, height } = attachment;
	let url = attachment.url;
	if (kind === "image" && width && height && Math.max(width, height) > MAX_IMAGE_EDGE) {
		const scale = MAX_IMAGE_EDGE / Math.max(width, height);
		const resized = new URL(attachment.proxyURL);
		resized.searchParams.set("width", String(Math.max(1, Math.round(width * scale))));
		resized.searchParams.set("height", String(Math.max(1, Math.round(height * scale))));
		url = resized.href;
	}

	const response = await fetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Failed to download attachment ${attachment.id}: ${response.status}`);
	}
	return new File([await response.blob()], attachment.id, {
		type: uploadTypeOf(attachment, kind, response),
	});
}

/**
 * アップロードするファイルの形式
 */
function uploadTypeOf(attachment: Attachment, kind: Kind, response: Response): string {
	const type = mediaTypeOf(attachment.contentType);
	if (kind === "document") return type === PDF_TYPE ? PDF_TYPE : TEXT_TYPE;
	// 縮めた画像は形式が変わることがあるので、届いた形式を使う
	const received = mediaTypeOf(response.headers.get("content-type"));
	return IMAGE_TYPES.has(received) ? received : type;
}

/**
 * メンションを名前にした本文
 * メンションの位置は、どこからが Bot への質問かを示すので残す
 */
function textOf(message: Message<true>): string {
	return cleanContent(message.content, message.channel);
}

function nameOf(message: Message): string {
	return message.member?.displayName ?? message.author.displayName;
}

/**
 * 答えを投稿する本文にする
 */
function formatAnswer(answer: Answer): string {
	if (answer.refused) return REFUSED_MESSAGE;

	// 出典はサイトごとに並べる
	const sites = new Map<string, string>();
	for (const url of answer.sources.filter((source) => URL.canParse(source))) {
		const host = new URL(url).hostname.replace(/^www\./, "");
		// サイトは www. を除いたホスト名で見分け、最初のページで代表させる
		if (!sites.has(host)) sites.set(host, url);
	}
	if (sites.size === 0) return answer.text;

	// リンクの括弧は Discord のリンクの記法と衝突するので、URL ではパーセントエンコードする
	const links = [...sites].map(
		([host, url]) => `[${host}](${url.replaceAll("(", "%28").replaceAll(")", "%29")})`,
	);
	// 出典は本文と見分けが付くよう、サブテキストの1行にする
	return `${answer.text}\n\n-# 出典: ${links.join(" · ")}`;
}

/**
 * 質問に返信する
 * 長い本文は分けて、2つ目からは返信にせず投稿する
 * 質問が削除されていても、返信先なしで投稿する
 */
async function post(question: Message<true>, content: string): Promise<void> {
	const [first, ...rest] = splitMessage(content);
	await question.reply({
		content: first,
		flags: MessageFlags.SuppressEmbeds,
		allowedMentions: { parse: [], repliedUser: true },
		failIfNotExists: false,
	});
	for (const chunk of rest) {
		await question.channel.send({
			content: chunk,
			flags: MessageFlags.SuppressEmbeds,
			allowedMentions: { parse: [] },
		});
	}
}

/**
 * 本文を行の区切りで分け、Discord のメッセージの文字数の上限に収める
 * 上限を超える行は、上限の文字数ごとに分ける
 */
function splitMessage(text: string): string[] {
	const lines = text
		.split("\n")
		.flatMap((line) =>
			Array.from(
				{ length: Math.max(1, Math.ceil(line.length / DISCORD_LIMITS.MAX_MESSAGE_LENGTH)) },
				(_, i) =>
					line.slice(
						i * DISCORD_LIMITS.MAX_MESSAGE_LENGTH,
						(i + 1) * DISCORD_LIMITS.MAX_MESSAGE_LENGTH,
					),
			),
		);

	const chunks: string[] = [];
	let current = "";
	for (const line of lines) {
		if (current && current.length + 1 + line.length > DISCORD_LIMITS.MAX_MESSAGE_LENGTH) {
			chunks.push(current);
			current = line;
		} else {
			current = current ? `${current}\n${line}` : line;
		}
	}
	chunks.push(current);
	return chunks;
}

/**
 * 止めるまで、質問のチャンネルに入力中の表示を出す
 * 入力中の表示を出せなくても、例外は投げない
 */
function keepTyping(question: Message<true>): () => void {
	const send = async () => {
		try {
			// チャンネルが削除されると、channel は null になる
			await question.channel.sendTyping();
		} catch {}
	};
	void send();
	const timer = setInterval(send, TYPING_INTERVAL);
	return () => clearInterval(timer);
}
