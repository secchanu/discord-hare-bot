import { Collection } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMember } from "./member";

/**
 * モックGuildMemberを生成するヘルパー
 */
function createMockMember(id: string, isBot = false) {
	return {
		id,
		user: { bot: isBot, id },
		toString: () => `<@${id}>`,
	};
}

/**
 * メンバーCollectionを生成するヘルパー
 */
function createMemberCollection(ids: string[], includeBot = false) {
	const collection = new Collection<string, ReturnType<typeof createMockMember>>();
	for (const id of ids) {
		collection.set(id, createMockMember(id, false));
	}
	if (includeBot) {
		const botId = "bot-1";
		collection.set(botId, createMockMember(botId, true));
	}
	return collection;
}

/**
 * インタラクションモックを生成するヘルパー
 * @param voiceChannel - VC（nullの場合はVC未接続）
 * @param inGuild - ギルド内かどうか
 * @param numberOption - /rand member の number オプション
 */
function createMockInteraction(
	voiceChannel: { members: Collection<string, ReturnType<typeof createMockMember>> } | null,
	inGuild = true,
	numberOption: number | null = 1,
) {
	return {
		inCachedGuild: vi.fn().mockReturnValue(inGuild),
		channel: inGuild ? {} : null,
		member: {
			roles: { cache: new Collection() },
			voice: { channel: voiceChannel },
		},
		options: {
			getInteger: vi.fn().mockReturnValue(numberOption),
		},
		deferReply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
		reply: vi.fn().mockResolvedValue(undefined),
	};
}

describe("/rand member", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("指定数 < メンバー数: 指定数だけ選ばれる", async () => {
		const members = createMemberCollection(["1", "2", "3", "4", "5"]);
		const voiceChannel = { members };
		const interaction = createMockInteraction(voiceChannel as never, true, 2);

		await handleMember(interaction as never);

		expect(interaction.editReply).toHaveBeenCalledOnce();
		const content = interaction.editReply.mock.calls[0][0] as string;
		const mentions = content.match(/<@\d+>/g) ?? [];
		expect(mentions).toHaveLength(2);
	});

	it("指定数 = メンバー数: 全員選ばれる（境界値）", async () => {
		const members = createMemberCollection(["1", "2", "3"]);
		const voiceChannel = { members };
		const interaction = createMockInteraction(voiceChannel as never, true, 3);

		await handleMember(interaction as never);

		expect(interaction.editReply).toHaveBeenCalledOnce();
		const content = interaction.editReply.mock.calls[0][0] as string;
		const mentions = content.match(/<@\d+>/g) ?? [];
		expect(mentions).toHaveLength(3);
	});

	it("指定数 > メンバー数: メンバー数で頭打ち（境界値）", async () => {
		const members = createMemberCollection(["1", "2"]);
		const voiceChannel = { members };
		const interaction = createMockInteraction(voiceChannel as never, true, 10);

		await handleMember(interaction as never);

		expect(interaction.editReply).toHaveBeenCalledOnce();
		const content = interaction.editReply.mock.calls[0][0] as string;
		const mentions = content.match(/<@\d+>/g) ?? [];
		// メンバー数(2)を超えない
		expect(mentions).toHaveLength(2);
	});

	it("VCに未接続の場合は「VCに接続していません」を返す", async () => {
		const interaction = createMockInteraction(null, true, 1);

		await handleMember(interaction as never);

		expect(interaction.editReply).toHaveBeenCalledWith("VCに接続していません");
	});

	it("選択可能なメンバーがいない（Botのみ）場合は「選択可能なメンバーがいません」を返す", async () => {
		// Botのみのコレクション
		const members = new Collection<string, ReturnType<typeof createMockMember>>();
		members.set("bot-1", createMockMember("bot-1", true));
		const voiceChannel = { members };
		const interaction = createMockInteraction(voiceChannel as never, true, 1);

		await handleMember(interaction as never);

		expect(interaction.editReply).toHaveBeenCalledWith("選択可能なメンバーがいません");
	});

	it("デフォルトではnumberが未指定の場合に1人選ばれる", async () => {
		const members = createMemberCollection(["1", "2", "3"]);
		const voiceChannel = { members };
		// numberOption = null → コード内で ?? 1 によりデフォルト1
		const interaction = createMockInteraction(voiceChannel as never, true, null);

		await handleMember(interaction as never);

		expect(interaction.editReply).toHaveBeenCalledOnce();
		const content = interaction.editReply.mock.calls[0][0] as string;
		const mentions = content.match(/<@\d+>/g) ?? [];
		expect(mentions).toHaveLength(1);
	});

	it("ギルド外（inCachedGuild=false）の場合はギルド外エラーを返す", async () => {
		const members = createMemberCollection(["1", "2"]);
		const voiceChannel = { members };
		const interaction = createMockInteraction(voiceChannel as never, false, 1);

		await handleMember(interaction as never);

		expect(interaction.editReply).toHaveBeenCalledWith(
			"このコマンドはサーバー内でのみ使用できます。",
		);
	});
});
