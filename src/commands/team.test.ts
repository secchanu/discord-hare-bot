import { Collection } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../bot/context";
import { DISCORD_LIMITS } from "../constants";

vi.mock("./helpers/room");

import { getRoomFromVoiceChannel } from "./helpers/room";
import { teamCommand } from "./team";

const mockCtx = { roomManager: {} } as unknown as AppContext;

/**
 * モックGuildMemberを生成するヘルパー
 */
function createMockMember(id: string) {
	return {
		id,
		displayName: `member-${id}`,
		user: { bot: false, id },
		toString: () => `<@${id}>`,
		voice: { channel: null },
	};
}

/**
 * メンバーCollectionを生成するヘルパー
 */
function createMemberCollection(ids: string[]) {
	const collection = new Collection<string, ReturnType<typeof createMockMember>>();
	for (const id of ids) {
		collection.set(id, createMockMember(id));
	}
	return collection;
}

/**
 * テスト用インタラクションのセットアップ
 * コレクターのハンドラを取得できるよう collectHandler への参照を返す
 */
function setupInteraction(
	memberIds: string[],
	teamNumber: number,
	mockRoom: {
		additionalVoiceChannelCount: number;
		setAdditionalVoiceChannels: ReturnType<typeof vi.fn>;
		moveMembers: ReturnType<typeof vi.fn>;
	},
) {
	const members = createMemberCollection(memberIds);

	vi.mocked(getRoomFromVoiceChannel).mockReturnValue(mockRoom as never);

	let collectHandler: ((interaction: unknown) => Promise<void>) | undefined;
	let endHandler: ((collected: unknown, reason: string) => Promise<void>) | undefined;
	const mockCollector = {
		on: vi.fn((event: string, handler: never) => {
			if (event === "collect") collectHandler = handler;
			if (event === "end") endHandler = handler;
		}),
		stop: vi.fn(),
	};
	const mockMessage = {
		createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
		edit: vi.fn().mockResolvedValue(undefined),
	};

	const mockInteraction = {
		inCachedGuild: vi.fn().mockReturnValue(true),
		channel: {},
		member: {
			roles: { cache: new Collection() },
			voice: {
				channel: {
					members: members as unknown as Collection<string, import("discord.js").GuildMember>,
				},
			},
		},
		options: {
			getInteger: vi.fn().mockReturnValue(teamNumber),
		},
		deferReply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(mockMessage),
		deleteReply: vi.fn().mockResolvedValue(undefined),
		reply: vi.fn().mockResolvedValue(undefined),
		user: { id: "user-1" },
	};

	return {
		mockInteraction,
		mockCollector,
		mockMessage,
		getCollectHandler: () => collectHandler,
		getEndHandler: () => endHandler,
	};
}

/**
 * デフォルトのモックルームを生成するヘルパー
 */
function createMockRoom() {
	return {
		additionalVoiceChannelCount: 0,
		setAdditionalVoiceChannels: vi.fn().mockResolvedValue(undefined),
		moveMembers: vi.fn().mockResolvedValue(true),
	};
}

describe("/team（チーム分け）", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("チーム数はメンバー数を上限にクランプされる", async () => {
		const { mockInteraction } = setupInteraction(["1", "2", "3"], 5, createMockRoom());

		await teamCommand.execute(mockInteraction as never, mockCtx);

		const editReplyCall = mockInteraction.editReply.mock.calls[0][0] as {
			content: string;
			components: unknown[];
		};
		expect(editReplyCall.content).toContain("チーム1");
		expect(editReplyCall.content).toContain("チーム2");
		expect(editReplyCall.content).toContain("チーム3");
		expect(editReplyCall.content).not.toContain("チーム4");
		expect(editReplyCall.content).not.toContain("チーム5");
	});

	it("全メンバーがいずれかのチームに属する", async () => {
		const { mockInteraction } = setupInteraction(["1", "2", "3", "4"], 2, createMockRoom());

		await teamCommand.execute(mockInteraction as never, mockCtx);

		const editReplyCall = mockInteraction.editReply.mock.calls[0][0] as {
			content: string;
		};
		for (const id of ["1", "2", "3", "4"]) {
			expect(editReplyCall.content).toContain(`<@${id}>`);
		}
	});

	it("チーム間のメンバー数の差が1以下になる", async () => {
		const { mockInteraction } = setupInteraction(["1", "2", "3", "4", "5"], 2, createMockRoom());

		await teamCommand.execute(mockInteraction as never, mockCtx);

		const editReplyCall = mockInteraction.editReply.mock.calls[0][0] as {
			content: string;
		};
		const teamSizes = editReplyCall.content
			.split("\n\n")
			.map((team) => (team.match(/<@\d+>/g) ?? []).length);
		expect(teamSizes).toHaveLength(2);
		expect(Math.max(...teamSizes) - Math.min(...teamSizes)).toBeLessThanOrEqual(1);
	});

	it("VCのメンバーが2人未満の場合はエラーを返す", async () => {
		const { mockInteraction } = setupInteraction(["1"], 2, createMockRoom());

		await teamCommand.execute(mockInteraction as never, mockCtx);

		expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.stringContaining("2人以上"));
	});
});

describe("/team（除外メニュー）", () => {
	/**
	 * 除外メニュー操作のインタラクションを生成するヘルパー
	 */
	function createExcludeInteraction(values: string[]) {
		return {
			customId: "exclude",
			values,
			isStringSelectMenu: () => true,
			update: vi.fn().mockResolvedValue(undefined),
			followUp: vi.fn().mockResolvedValue(undefined),
			user: { id: "user-1" },
		};
	}

	/**
	 * 最後の update 呼び出しの引数を返すヘルパー
	 */
	function lastUpdateArgs(interaction: { update: ReturnType<typeof vi.fn> }) {
		return interaction.update.mock.lastCall![0] as {
			content: string;
			components: Array<{
				components: Array<{ options: Array<{ data: { value: string; default?: boolean } }> }>;
			}>;
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("初期表示: 除外メニューにVCの全メンバーが並ぶ", async () => {
		const { mockInteraction } = setupInteraction(["1", "2", "3"], 2, createMockRoom());

		await teamCommand.execute(mockInteraction as never, mockCtx);

		const editReplyCall = mockInteraction.editReply.mock.calls[0][0] as {
			components: Array<{
				components: Array<{
					data: { custom_id: string };
					options: Array<{ data: { value: string } }>;
				}>;
			}>;
		};
		const select = editReplyCall.components[0].components[0];
		expect(select.data.custom_id).toBe("exclude");
		expect(select.options.map((o) => o.data.value)).toEqual(["1", "2", "3"]);
	});

	it("選んだメンバーはチーム分けから外れ、除外として表示される", async () => {
		const { mockInteraction, getCollectHandler } = setupInteraction(
			["1", "2", "3", "4"],
			2,
			createMockRoom(),
		);
		await teamCommand.execute(mockInteraction as never, mockCtx);

		const excludeInteraction = createExcludeInteraction(["2", "4"]);
		await getCollectHandler()!(excludeInteraction);

		const [teamList, excludedLine] = lastUpdateArgs(excludeInteraction).content.split("\n\n除外: ");
		expect(teamList).toContain("<@1>");
		expect(teamList).toContain("<@3>");
		expect(teamList).not.toContain("<@2>");
		expect(teamList).not.toContain("<@4>");
		expect(excludedLine).toBe("<@2> <@4>");
	});

	it("残りが2人未満になる選択は受け付けず、操作者にエラーを返す", async () => {
		const { mockInteraction, getCollectHandler } = setupInteraction(
			["1", "2", "3"],
			2,
			createMockRoom(),
		);
		await teamCommand.execute(mockInteraction as never, mockCtx);

		const excludeInteraction = createExcludeInteraction(["2", "3"]);
		await getCollectHandler()!(excludeInteraction);

		const content = lastUpdateArgs(excludeInteraction).content;
		for (const id of ["1", "2", "3"]) {
			expect(content).toContain(`<@${id}>`);
		}
		expect(content).not.toContain("除外");
		expect(excludeInteraction.followUp).toHaveBeenCalledWith(
			expect.objectContaining({ content: expect.stringContaining("2人以上") }),
		);
	});

	it("再抽選しても除外は維持される", async () => {
		const { mockInteraction, getCollectHandler } = setupInteraction(
			["1", "2", "3", "4"],
			2,
			createMockRoom(),
		);
		await teamCommand.execute(mockInteraction as never, mockCtx);
		await getCollectHandler()!(createExcludeInteraction(["4"]));

		const rerollInteraction = {
			customId: "reroll",
			update: vi.fn().mockResolvedValue(undefined),
			user: { id: "user-1" },
		};
		await getCollectHandler()!(rerollInteraction);

		const [teamList, excludedLine] = lastUpdateArgs(rerollInteraction).content.split("\n\n除外: ");
		expect(teamList).not.toContain("<@4>");
		expect(excludedLine).toBe("<@4>");
	});

	it("除外後のメニューは除外したメンバーだけが選択済みになる", async () => {
		const { mockInteraction, getCollectHandler } = setupInteraction(
			["1", "2", "3", "4"],
			2,
			createMockRoom(),
		);
		await teamCommand.execute(mockInteraction as never, mockCtx);

		const excludeInteraction = createExcludeInteraction(["4"]);
		await getCollectHandler()!(excludeInteraction);

		const options = lastUpdateArgs(excludeInteraction).components[0].components[0].options;
		const selected = options.filter((o) => o.data.default === true).map((o) => o.data.value);
		expect(selected).toEqual(["4"]);
	});

	it("VCのメンバーが上限を超えるとき、メニューには先頭の上限人数だけが並ぶ", async () => {
		const limit = DISCORD_LIMITS.MAX_SELECT_MENU_OPTIONS;
		const ids = Array.from({ length: limit + 1 }, (_, i) => String(i + 1));
		const { mockInteraction } = setupInteraction(ids, 2, createMockRoom());

		await teamCommand.execute(mockInteraction as never, mockCtx);

		const editReplyCall = mockInteraction.editReply.mock.calls[0][0] as {
			components: Array<{ components: Array<{ options: Array<{ data: { value: string } }> }> }>;
		};
		const values = editReplyCall.components[0].components[0].options.map((o) => o.data.value);
		expect(values).toEqual(ids.slice(0, limit));
	});
});

describe("/team（ボタン操作）", () => {
	/**
	 * 共通のセットアップ: 4人メンバー、ルームあり
	 */
	async function setupTeamCommand(teamNumber = 2) {
		const mockRoom = createMockRoom();
		const setup = setupInteraction(["1", "2", "3", "4"], teamNumber, mockRoom);

		await teamCommand.execute(setup.mockInteraction as never, mockCtx);

		return { ...setup, mockRoom };
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("初期表示: チーム一覧 + 除外メニュー + cancel/confirm/rerollボタンが表示される", async () => {
		const { mockInteraction } = await setupTeamCommand();

		const editReplyCall = mockInteraction.editReply.mock.calls[0][0] as {
			content: string;
			components: Array<{ components: Array<{ data: { custom_id: string } }> }>;
		};

		expect(editReplyCall.content).toContain("チーム1");
		expect(editReplyCall.content).toContain("チーム2");

		expect(editReplyCall.components[0].components[0].data.custom_id).toBe("exclude");
		const buttonIds = editReplyCall.components[1].components.map((c) => c.data.custom_id);
		expect(buttonIds).toContain("cancel");
		expect(buttonIds).toContain("confirm");
		expect(buttonIds).toContain("reroll");
	});

	it("セッションUIに無操作タイムアウト（idle）が設定される", async () => {
		const { mockMessage } = await setupTeamCommand();

		const collectorOptions = mockMessage.createMessageComponentCollector.mock.calls[0][0] as {
			idle?: number;
		};
		expect(collectorOptions.idle).toBeGreaterThan(0);
	});

	it("実行者以外のボタン操作は弾き、操作者に返信する", async () => {
		const { mockMessage } = await setupTeamCommand();

		const collectorOptions = mockMessage.createMessageComponentCollector.mock.calls[0][0] as {
			filter: (i: unknown) => Promise<boolean>;
		};
		const otherUserInteraction = {
			customId: "reroll",
			user: { id: "user-2" },
			reply: vi.fn().mockResolvedValue(undefined),
		};

		await expect(collectorOptions.filter(otherUserInteraction)).resolves.toBe(false);
		expect(otherUserInteraction.reply).toHaveBeenCalledOnce();
	});

	it("reroll後: チーム一覧が表示され、同じ除外メニューとcancel/confirm/rerollボタン行が残る", async () => {
		const { getCollectHandler } = await setupTeamCommand();

		const rerollButtonInteraction = {
			customId: "reroll",
			deferUpdate: vi.fn(),
			update: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
			user: { id: "user-1" },
		};

		await getCollectHandler()!(rerollButtonInteraction);

		expect(rerollButtonInteraction.update).toHaveBeenCalledOnce();
		const updateArgs = rerollButtonInteraction.update.mock.calls[0][0] as {
			content: string;
			components: Array<{ components: Array<{ data: { custom_id: string } }> }>;
		};

		expect(updateArgs.content).toContain("チーム1");
		expect(updateArgs.content).toContain("チーム2");

		expect(updateArgs.components[0].components[0].data.custom_id).toBe("exclude");
		const buttonIds = updateArgs.components[1].components.map((c) => c.data.custom_id);
		expect(buttonIds).toContain("cancel");
		expect(buttonIds).toContain("confirm");
		expect(buttonIds).toContain("reroll");
	});

	it("confirm後: moveボタンのみに切り替わる", async () => {
		const { getCollectHandler } = await setupTeamCommand();

		const confirmButtonInteraction = {
			customId: "confirm",
			deferUpdate: vi.fn(),
			update: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
			user: { id: "user-1" },
		};

		await getCollectHandler()!(confirmButtonInteraction);

		expect(confirmButtonInteraction.update).toHaveBeenCalledOnce();
		const updateArgs = confirmButtonInteraction.update.mock.calls[0][0] as {
			components: Array<{ components: Array<{ data: { custom_id: string } }> }>;
		};

		const buttonIds = updateArgs.components[0].components.map((c) => c.data.custom_id);
		expect(buttonIds).toContain("move");
		expect(buttonIds).not.toContain("cancel");
		expect(buttonIds).not.toContain("confirm");
		expect(buttonIds).not.toContain("reroll");
	});

	it("move後: チーム一覧が残った状態でmoveボタンのみ（コンテンツは消えない）", async () => {
		const { getCollectHandler } = await setupTeamCommand();

		const moveButtonInteraction = {
			customId: "move",
			deferUpdate: vi.fn().mockResolvedValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
			user: { id: "user-1" },
		};

		await getCollectHandler()!(moveButtonInteraction);

		expect(moveButtonInteraction.deferUpdate).toHaveBeenCalledOnce();
		expect(moveButtonInteraction.editReply).toHaveBeenCalledOnce();

		const editReplyArgs = moveButtonInteraction.editReply.mock.calls[0][0] as {
			content: string;
			components: Array<{ components: Array<{ data: { custom_id: string } }> }>;
		};

		// コンテンツ（チーム一覧）は残る
		expect(editReplyArgs.content).toContain("チーム1");
		expect(editReplyArgs.content).toContain("チーム2");

		// moveボタンのみ
		const buttonIds = editReplyArgs.components[0].components.map((c) => c.data.custom_id);
		expect(buttonIds).toContain("move");
		expect(buttonIds).not.toContain("cancel");
		expect(buttonIds).not.toContain("confirm");
		expect(buttonIds).not.toContain("reroll");
	});

	it("move後: チーム数ぶんの追加VCを確保し、全メンバーを各チームのVCへ移動する", async () => {
		const { getCollectHandler, mockRoom } = await setupTeamCommand();

		const moveButtonInteraction = {
			customId: "move",
			deferUpdate: vi.fn().mockResolvedValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockResolvedValue(undefined),
			user: { id: "user-1" },
		};

		await getCollectHandler()!(moveButtonInteraction);

		expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(2);
		expect(mockRoom.moveMembers).toHaveBeenCalledTimes(4);
		const targetIndexes = mockRoom.moveMembers.mock.calls.map(([, index]) => index as number);
		expect(new Set(targetIndexes)).toEqual(new Set([1, 2]));
	});

	it("cancel後: ボタン側のインタラクションでリプライが削除される", async () => {
		const { mockCollector, getCollectHandler } = await setupTeamCommand();

		const cancelButtonInteraction = {
			customId: "cancel",
			deferUpdate: vi.fn().mockResolvedValue(undefined),
			update: vi.fn(),
			editReply: vi.fn(),
			// 元コマンドのトークンは15分で失効するため、削除はボタン側インタラクションで行う
			deleteReply: vi.fn().mockResolvedValue(undefined),
			user: { id: "user-1" },
		};

		await getCollectHandler()!(cancelButtonInteraction);

		expect(mockCollector.stop).toHaveBeenCalledWith("cancel");
		expect(cancelButtonInteraction.deferUpdate).toHaveBeenCalledOnce();
		expect(cancelButtonInteraction.deleteReply).toHaveBeenCalledOnce();
	});

	it("セッション終了時（タイムアウト）: メッセージからボタンが取り除かれる", async () => {
		const { mockMessage, getEndHandler } = await setupTeamCommand();

		await getEndHandler()!(new Collection(), "idle");

		expect(mockMessage.edit).toHaveBeenCalledWith({ components: [] });
	});

	it("セッション終了時（キャンセル起因）: メッセージは編集しない", async () => {
		const { mockMessage, getEndHandler } = await setupTeamCommand();

		await getEndHandler()!(new Collection(), "cancel");

		expect(mockMessage.edit).not.toHaveBeenCalled();
	});
});
