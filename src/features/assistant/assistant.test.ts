import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { TIME } from "../../constants";
import { apiRequest } from "../../testing/discord/server";
import { createWorld, type World } from "../../testing/world";
import type { CreateMessage } from "./Claude";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type MessageCreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Block = { type: string; cache_control?: unknown };

// API が受け付けるキャッシュブレークポイントの数の上限
const MAX_BREAKPOINTS = 4;
// Discord の入力中の表示が、送ってから消えるまでの時間
const TYPING_DURATION = 10 * TIME.SECOND;

let world: World;

afterEach(() => {
	world.dispose();
});

/**
 * 決めた応答を順に返す Claude API
 * API が拒否するリクエストを受け取ったら例外を投げる
 */
function fakeClaude(responses: (BetaMessage | Error | Promise<BetaMessage>)[]): {
	createMessage: CreateMessage;
	requests: MessageCreateParams[];
} {
	const requests: MessageCreateParams[] = [];
	return {
		requests,
		createMessage: async (params) => {
			// 送ったあとに会話へ書き足されるので、送った時点の写しを残す
			requests.push(structuredClone(params));
			assertAcceptable(params);
			const response = responses.shift();
			if (!response) throw new Error("応答を用意していません");
			if (response instanceof Error) throw response;
			return response;
		},
	};
}

/**
 * API の制約を満たすリクエストか確かめる
 */
function assertAcceptable(params: MessageCreateParams): void {
	const blocks = [
		...(Array.isArray(params.system) ? params.system : []),
		...params.messages.flatMap((message) => blocksOf(message)),
	] as Block[];
	const breakpoints =
		blocks.filter((block) => block.cache_control).length + (params.cache_control ? 1 : 0);
	if (breakpoints > MAX_BREAKPOINTS) throw new Error("キャッシュブレークポイントが多すぎます");
	if (blocks.some((block) => block.type.endsWith("thinking") && block.cache_control)) {
		throw new Error("思考のブロックにキャッシュブレークポイントは置けません");
	}
}

function blocksOf(message: BetaMessageParam): Block[] {
	return typeof message.content === "string"
		? [{ type: "text" }]
		: (message.content as unknown as Block[]);
}

/**
 * 呼び出し側が決めたときに返る応答
 */
function deferred(): { promise: Promise<BetaMessage>; resolve: (message: BetaMessage) => void } {
	let resolve: (message: BetaMessage) => void = () => {};
	const promise = new Promise<BetaMessage>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function claudeMessage(
	content: unknown[],
	stopReason: BetaMessage["stop_reason"] = "end_turn",
): BetaMessage {
	return {
		id: "msg",
		type: "message",
		role: "assistant",
		model: "test-model",
		content,
		stop_reason: stopReason,
		stop_sequence: null,
		usage: { input_tokens: 1, output_tokens: 1 },
	} as unknown as BetaMessage;
}

function text(value: string, citations: unknown[] | null = null) {
	return { type: "text", text: value, citations };
}

/**
 * 検索とその結果
 */
function search(...urls: string[]) {
	return [
		{ type: "server_tool_use", id: "srvtoolu_search", name: "web_search", input: { query: "q" } },
		{
			type: "web_search_tool_result",
			tool_use_id: "srvtoolu_search",
			content: urls.map((url) => ({
				type: "web_search_result",
				url,
				title: url,
				encrypted_content: "encrypted",
				page_age: null,
			})),
		},
	];
}

/**
 * コード実行からのページの取得とその結果
 */
function fetchPage(url: string, title: string) {
	return [
		{
			type: "server_tool_use",
			id: "srvtoolu_fetch",
			name: "web_fetch",
			input: { url },
			caller: { type: "code_execution_20260120", tool_id: "srvtoolu_code" },
		},
		{
			type: "web_fetch_tool_result",
			tool_use_id: "srvtoolu_fetch",
			caller: { type: "code_execution_20260120", tool_id: "srvtoolu_code" },
			content: {
				type: "web_fetch_result",
				url,
				retrieved_at: null,
				content: {
					type: "document",
					title,
					source: { type: "text", media_type: "text/plain", data: "本文" },
					citations: { enabled: true },
				},
			},
		},
	];
}

function searchCitation(url: string, title: string) {
	return {
		type: "web_search_result_location",
		url,
		title,
		cited_text: "",
		encrypted_index: "encrypted",
	};
}

function systemMessages(request: MessageCreateParams): BetaMessageParam[] {
	return request.messages.filter((message) => message.role === "system");
}

describe("質問の受け付け", () => {
	it("ルームでメンションされると、質問に答えを返信する", async () => {
		const claude = fakeClaude([claudeMessage([text("キャラAがおすすめです")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		const question = await members[0].post(room.textChannel, {
			mentionBot: true,
			content: "おすすめのキャラは？",
		});

		const [reply] = world.botMessages(room.textChannel);
		expect(reply.content).toBe("キャラAがおすすめです");
		expect(reply.replyToId).toBe(question.id);
	});

	it("ルームのボイスチャンネルのチャットでメンションされても答える", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.voiceChannel, { mentionBot: true, content: "質問" });

		expect(world.botMessages(room.voiceChannel).map((message) => message.content)).toEqual([
			"答え",
		]);
	});

	it("ルームの外でメンションされても答えない", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const alice = world.addMember("alice");

		await alice.post(world.generalChannel, { mentionBot: true, content: "質問" });

		expect(claude.requests).toEqual([]);
		expect(world.botMessages(world.generalChannel)).toEqual([]);
	});

	it("メンションされていない発言には答えない", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { content: "独り言" });

		expect(claude.requests).toEqual([]);
	});

	it("Bot の答えへの返信には、メンションがなくても答える", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")]), claudeMessage([text("次の答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");
		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });
		const [answer] = world.botMessages(room.textChannel);

		await members[0].post(room.textChannel, { content: "続きの質問", replyTo: answer });

		expect(world.botMessages(room.textChannel).at(-1)?.content).toBe("次の答え");
	});

	it("Bot のコマンドの結果への返信には答えない", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");
		await members[0].run("call", room.textChannel);
		const [result] = world.botMessages(room.textChannel);

		await members[0].post(room.textChannel, { content: "ありがとう", replyTo: result });

		expect(claude.requests).toEqual([]);
	});

	it("Bot に通知しない返信には答えない", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")]), claudeMessage([text("次の答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");
		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });
		const [answer] = world.botMessages(room.textChannel);

		await members[0].post(room.textChannel, {
			content: "ありがとう",
			replyTo: answer,
			notifyRepliedUser: false,
		});

		expect(claude.requests).toHaveLength(1);
	});

	it("続けて聞かれた場合は、前の質問に答えてから次の質問に答える", async () => {
		const claude = fakeClaude([claudeMessage([text("最初の答え")]), claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");
		const botId = world.server.botUserId;

		for (const content of ["最初の質問", "次の質問"]) {
			world.server.postMessage(members[0].id, room.textChannel.id, {
				content: `<@${botId}> ${content}`,
				mentionUserIds: [botId],
			});
		}
		await world.settle();

		expect(JSON.stringify(claude.requests[1].messages)).toContain("最初の答え");
	});

	it("前の答えを投稿できなかった場合も、次の質問には答える", async () => {
		const first = deferred();
		const second = deferred();
		const claude = fakeClaude([first.promise, second.promise]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");
		await members[0].post(room.textChannel, { mentionBot: true, content: "最初の質問" });
		await members[0].post(room.textChannel, { mentionBot: true, content: "次の質問" });

		const restore = world.server.fail(apiRequest("POST", /\/messages$/));
		first.resolve(claudeMessage([text("最初の答え")]));
		await world.settle();
		restore();
		second.resolve(claudeMessage([text("次の答え")]));
		await world.settle();

		expect(world.botMessages(room.textChannel).map((message) => message.content)).toEqual([
			"次の答え",
		]);
	});

	it("待っている質問のチャンネルが削除された場合も、ルームの次の質問には答える", async () => {
		const first = deferred();
		const claude = fakeClaude([
			first.promise,
			claudeMessage([text("答え")]),
			claudeMessage([text("答え")]),
		]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");
		await members[0].run("room vc", room.textChannel, { number: 1 });
		const [extraVoiceChannel] = room.additionalVoiceChannels;
		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });
		await members[0].post(extraVoiceChannel, { mentionBot: true, content: "消える質問" });

		await members[0].run("room vc", room.textChannel, { number: 0 });
		first.resolve(claudeMessage([text("答え")]));
		const next = await members[0].post(room.textChannel, { mentionBot: true, content: "次の質問" });

		expect(world.botMessages(room.textChannel).map((message) => message.replyToId)).toContain(
			next.id,
		);
	});
});

describe("会話", () => {
	it("前の質問と Claude の応答を、受け取ったときのまま次の質問に添える", async () => {
		const first = claudeMessage([
			...search("https://example.org/characters"),
			text("キャラAです", [searchCitation("https://example.org/characters", "キャラ一覧")]),
		]);
		const claude = fakeClaude([first, claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "おすすめのキャラは？" });
		await members[0].post(room.textChannel, { mentionBot: true, content: "武器は？" });

		const messages = claude.requests[1].messages;
		expect(JSON.stringify(messages)).toContain("おすすめのキャラは？");
		expect(messages).toContainEqual({ role: "assistant", content: first.content });
	});

	it("Bot に向けていない発言は会話に入れない", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")]), claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice", "bob");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });
		await members[1].post(room.textChannel, { content: "今日は何時まで？" });
		await members[0].post(room.textChannel, { mentionBot: true, content: "次の質問" });

		expect(JSON.stringify(claude.requests[1].messages)).not.toContain("今日は何時まで？");
	});

	it("Bot へのメンションは、元の位置のまま Bot の表示名として渡す", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		world.server.renameMember(world.server.botUserId, "サンプルBot");
		await world.restartBot();
		const { room, members } = await world.setupRoom("alice");

		world.server.postMessage(members[0].id, room.textChannel.id, {
			content: `さっきの話だけど <@${world.server.botUserId}> これってどうなの？`,
			mentionUserIds: [world.server.botUserId],
		});
		await world.settle();

		expect(claude.requests[0].messages[0].content).toContain(
			"さっきの話だけど @サンプルBot これってどうなの？",
		);
	});

	it("質問者の表示名を添えて Claude に渡す", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		expect(claude.requests[0].messages[0].content).toContain("alice");
	});

	it("サーバーと Bot を、Discord での名前で Claude に伝える", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		world.server.renameGuild("サンプルサーバー");
		world.server.renameMember(world.server.botUserId, "サンプルBot");
		await world.restartBot();
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		const system = JSON.stringify(claude.requests[0].system);
		expect(system).toContain("サンプルサーバー");
		expect(system).toContain("サンプルBot");
	});

	it("ほかの人の発言への返信の場合は、返信先を引用して質問に添える", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice", "carol");
		const target = await members[1].post(room.textChannel, { content: "さっきの試合の話ね" });

		await members[0].post(room.textChannel, { mentionBot: true, content: "です", replyTo: target });

		expect(claude.requests[0].messages[0].content).toContain("さっきの試合の話ね");
	});

	it.each([
		["答えを用意できなかった", new Error("overloaded")],
		["断られた", claudeMessage([], "refusal")],
		["答えが途中で止まった", claudeMessage([text("途中")], "max_tokens")],
		["答えに本文がなかった", claudeMessage([])],
	])("%s場合は、その質問を会話に残さない", async (_, response) => {
		const claude = fakeClaude([response, claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "残さない質問" });
		await members[0].post(room.textChannel, { mentionBot: true, content: "次の質問" });

		expect(JSON.stringify(claude.requests[1].messages)).not.toContain("残さない質問");
	});

	it("Bot を再起動しても、ルームの会話を引き継ぐ", async () => {
		const claude = fakeClaude([
			claudeMessage([text("キャラAです")]),
			claudeMessage([text("答え")]),
		]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");
		await members[0].post(room.textChannel, { mentionBot: true, content: "おすすめのキャラは？" });

		await world.restartBot();
		await members[0].post(room.textChannel, { mentionBot: true, content: "武器は？" });

		expect(JSON.stringify(claude.requests[1].messages)).toContain("キャラAです");
	});

	it("ルームを削除した場合は、ルームの会話も削除する", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");
		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });
		expect(world.savedConversation(room.categoryId)).toBeDefined();

		await members[0].leaveVoice();

		expect(world.savedConversation(room.categoryId)).toBeUndefined();
	});

	it("答えている途中でルームを削除した場合も、ルームの会話は残らない", async () => {
		const response = deferred();
		const claude = fakeClaude([claudeMessage([text("答え")]), response.promise]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");
		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });
		expect(world.savedConversation(room.categoryId)).toBeDefined();
		await members[0].post(room.textChannel, { mentionBot: true, content: "次の質問" });

		await members[0].leaveVoice();
		response.resolve(claudeMessage([text("答え")]));
		await world.settle();

		expect(world.savedConversation(room.categoryId)).toBeUndefined();
	});
});

describe("ルームのゲーム", () => {
	it("最初の質問では、質問の直後にルームのゲームを伝える", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		const room = await alice.createRoom();
		await alice.post(world.wantedChannel, { mentions: [apex] });

		await alice.post(room.textChannel, { mentionBot: true, content: "おすすめのレジェンドは？" });

		const last = claude.requests[0].messages.at(-1);
		expect(last?.role).toBe("system");
		expect(last?.content).toContain("APEX");
	});

	it("ゲームが変わらない間は、ゲームを伝え直さない", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")]), claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });
		await members[0].post(room.textChannel, { mentionBot: true, content: "次の質問" });

		expect(systemMessages(claude.requests[1])).toHaveLength(1);
	});

	it("ゲームを変えた場合は、次の質問の直後に新しいゲームを伝える", async () => {
		const claude = fakeClaude([claudeMessage([text("答え")]), claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		const room = await alice.createRoom();
		await alice.post(room.textChannel, { mentionBot: true, content: "質問" });

		await alice.post(world.wantedChannel, { mentions: [apex] });
		await alice.post(room.textChannel, { mentionBot: true, content: "次の質問" });

		const last = claude.requests[1].messages.at(-1);
		expect(last?.role).toBe("system");
		expect(last?.content).toContain("APEX");
	});

	describe("会話が要約された場合", () => {
		const summarized = claudeMessage([
			{ type: "compaction", content: "これまでの要約" },
			text("答え"),
		]);

		async function askAfterSummary(questions: number) {
			const claude = fakeClaude([
				claudeMessage([text("最初の答え")]),
				summarized,
				...Array.from({ length: questions }, () => claudeMessage([text("答え")])),
			]);
			world = await createWorld({ claude: claude.createMessage });
			const { room, members } = await world.setupRoom("alice");
			for (const content of ["最初の質問", "要約される質問"]) {
				await members[0].post(room.textChannel, { mentionBot: true, content });
			}
			for (let i = 0; i < questions; i++) {
				await members[0].post(room.textChannel, { mentionBot: true, content: `質問${i}` });
			}
			return claude.requests.slice(2);
		}

		it("要約より前のやり取りは送らない", async () => {
			const [request] = await askAfterSummary(1);

			expect(request.messages[0]).toEqual({ role: "assistant", content: summarized.content });
			expect(JSON.stringify(request.messages)).not.toContain("最初の質問");
		});

		it("次の質問の直後にゲームを伝え直す", async () => {
			const [request] = await askAfterSummary(1);

			expect(request.messages.at(-1)?.role).toBe("system");
		});

		it("ゲームを伝え直した後は、ゲームが変わらない間は伝え直さない", async () => {
			const [, request] = await askAfterSummary(2);

			expect(systemMessages(request)).toHaveLength(1);
		});
	});

	it("要約に失敗した場合は、それまでのやり取りを残す", async () => {
		const claude = fakeClaude([
			claudeMessage([text("最初の答え")]),
			claudeMessage([{ type: "compaction", content: null }, text("答え")]),
			claudeMessage([text("答え")]),
		]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		for (const content of ["最初の質問", "2つめの質問", "3つめの質問"]) {
			await members[0].post(room.textChannel, { mentionBot: true, content });
		}

		expect(JSON.stringify(claude.requests[2].messages)).toContain("最初の質問");
	});
});

describe("出典", () => {
	it("答えが引用した検索結果を、本文の後にサブテキストの1行でサイトごとに添える", async () => {
		const url = "https://example.org/guide";
		const claude = fakeClaude([
			claudeMessage([...search(url), text("キャラAです", [searchCitation(url, "攻略")])]),
		]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "おすすめのキャラは？" });

		expect(world.botMessages(room.textChannel)[0].content).toBe(
			"キャラAです\n\n-# 出典: [example.org](https://example.org/guide)",
		);
	});

	it("答えのために取得したページを出典として添える", async () => {
		const claude = fakeClaude([
			claudeMessage([
				...fetchPage("https://example.org/characters", "キャラ一覧"),
				text("近距離が得意です"),
			]),
		]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "得意な距離は？" });

		expect(world.botMessages(room.textChannel)[0].content).toBe(
			"近距離が得意です\n\n-# 出典: [example.org](https://example.org/characters)",
		);
	});

	it("同じサイトの出典は、最初のページで1つにまとめる", async () => {
		const first = "https://www.example.org/characters";
		const second = "https://example.org/weapons";
		const other = "https://example.com/guide";
		const claude = fakeClaude([
			claudeMessage([
				...search(first, second, other),
				text("答え", [
					searchCitation(first, "キャラ一覧"),
					searchCitation(second, "武器一覧"),
					searchCitation(other, "攻略"),
				]),
			]),
		]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		expect(world.botMessages(room.textChannel)[0].content).toBe(
			"答え\n\n-# 出典: [example.org](https://www.example.org/characters) · [example.com](https://example.com/guide)",
		);
	});

	it("出典の URL の括弧は、Discord のリンクを途中で切らないようにパーセントエンコードする", async () => {
		const url = "https://example.org/maps_(new)";
		const claude = fakeClaude([
			claudeMessage([...search(url), text("答え", [searchCitation(url, "新マップ")])]),
		]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		expect(world.botMessages(room.textChannel)[0].content).toContain(
			"[example.org](https://example.org/maps_%28new%29)",
		);
	});
});

describe("答えの投稿", () => {
	it("答えを用意している間は、入力中の表示を出し続ける", async () => {
		const response = deferred();
		const claude = fakeClaude([response.promise]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");
		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		await world.advance(3 * TYPING_DURATION);

		const times = world.server.typings
			.filter((typing) => typing.channelId === room.textChannel.id)
			.map((typing) => typing.at);
		const gaps = [...times.slice(1), Date.now()].map((time, index) => time - times[index]);
		expect(Math.max(...gaps)).toBeLessThan(TYPING_DURATION);
	});

	it("ツールの実行の合間に書かれた途中経過は投稿しない", async () => {
		const claude = fakeClaude([
			claudeMessage([
				text("Let me search."),
				...search("https://example.org/characters"),
				text("答え"),
			]),
		]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		expect(world.botMessages(room.textChannel).map((message) => message.content)).toEqual(["答え"]);
	});

	it("サーバーツールの実行が中断された場合は、送り直して続きの答えまで返す", async () => {
		const paused = claudeMessage(search("https://example.org/characters"), "pause_turn");
		const claude = fakeClaude([paused, claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		expect(claude.requests[1].messages.at(-1)).toEqual({
			role: "assistant",
			content: paused.content,
		});
		expect(world.botMessages(room.textChannel)[0].content).toBe("答え");
	});

	it("長い応答が中断された場合も、API が受け付ける形で送り直して続きの答えまで返す", async () => {
		const blocks = Array.from({ length: 13 }, () =>
			search("https://example.org/characters"),
		).flat();
		const claude = fakeClaude([claudeMessage(blocks, "pause_turn"), claudeMessage([text("答え")])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		expect(world.botMessages(room.textChannel).map((message) => message.content)).toEqual(["答え"]);
	});

	it("2000文字を超える答えは、行の区切りで2000文字以内のメッセージに分けて投稿する", async () => {
		const longAnswer = Array.from({ length: 30 }, (_, i) => `${i}`.padEnd(99, "あ")).join("\n");
		const claude = fakeClaude([claudeMessage([text(longAnswer)])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		const contents = world.botMessages(room.textChannel).map((message) => message.content);
		expect(contents.join("\n")).toBe(longAnswer);
	});

	it("改行のない2000文字を超える行も、2000文字以内のメッセージに分けて投稿する", async () => {
		const longLine = "あ".repeat(2500);
		const claude = fakeClaude([claudeMessage([text(longLine)])]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		const contents = world.botMessages(room.textChannel).map((message) => message.content);
		expect(contents.join("")).toBe(longLine);
	});

	it("答えに含まれるメンションでは、分けて投稿した続きも含めて、質問者のほかには通知しない", async () => {
		const responses: BetaMessage[] = [];
		const claude = fakeClaude(responses);
		world = await createWorld({ claude: claude.createMessage });
		const apex = world.addRole("APEX");
		const { room, members } = await world.setupRoom("alice", "bob");
		const mentions = `@everyone <@&${apex.id}> <@${members[1].id}> 集合です`;
		responses.push(
			claudeMessage([
				text(`${mentions}
${"あ".repeat(2000)}
${mentions}`),
			]),
		);

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		const notified = world.botMessages(room.textChannel).map((message) => message.notified);
		expect(notified.some((target) => target.everyone)).toBe(false);
		expect(notified.flatMap((target) => target.roleIds)).toEqual([]);
		expect(notified.flatMap((target) => target.userIds)).toEqual([members[0].id]);
	});

	it("答えを用意できなかった場合は、そのことを返信する", async () => {
		const claude = fakeClaude([new Error("overloaded")]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		expect(world.botMessages(room.textChannel).map((message) => message.content)).toEqual([
			"答えを用意できませんでした\n少し待ってからもう一度聞いてください",
		]);
	});

	it("答えることを断られた場合は、答えられないと返信する", async () => {
		const claude = fakeClaude([claudeMessage([], "refusal")]);
		world = await createWorld({ claude: claude.createMessage });
		const { room, members } = await world.setupRoom("alice");

		await members[0].post(room.textChannel, { mentionBot: true, content: "質問" });

		expect(world.botMessages(room.textChannel).map((message) => message.content)).toEqual([
			"この質問には答えられません",
		]);
	});
});
