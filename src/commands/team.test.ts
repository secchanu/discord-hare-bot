import { Collection } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../bot/context";

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
		options: { getInteger: vi.fn().mockReturnValue(teamNumber) },
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

describe("/team（ロジック）", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("チーム数はメンバー数を上限にクランプされる（メンバー3人でチーム数5を指定 → 3チーム）", async () => {
		const { mockInteraction } = setupInteraction(["1", "2", "3"], 5, createMockRoom());

		await teamCommand.execute(mockInteraction as never, mockCtx);

		const editReplyCall = mockInteraction.editReply.mock.calls[0][0] as {
			content: string;
			components: unknown[];
		};
		// 3チームのみが表示される（5チームではない）
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
		// 4人全員がチームのどこかに表示される
		for (const id of ["1", "2", "3", "4"]) {
			expect(editReplyCall.content).toContain(`<@${id}>`);
		}
	});

	it("チーム間のメンバー数の差が1以下になる（5人を2チームに分割）", async () => {
		const { mockInteraction } = setupInteraction(["1", "2", "3", "4", "5"], 2, createMockRoom());

		await teamCommand.execute(mockInteraction as never, mockCtx);

		const editReplyCall = mockInteraction.editReply.mock.calls[0][0] as {
			content: string;
		};
		// チーム1とチーム2が存在し、かつ5人全員が含まれる
		expect(editReplyCall.content).toContain("チーム1");
		expect(editReplyCall.content).toContain("チーム2");
		const totalMentions = (editReplyCall.content.match(/<@\d+>/g) ?? []).length;
		expect(totalMentions).toBe(5);
	});
});

describe("/team（UI状態分岐）", () => {
	/**
	 * 共通のセットアップ: 4人メンバー、ルームあり
	 */
	async function setupTeamCommand(teamNumber = 2) {
		const setup = setupInteraction(["1", "2", "3", "4"], teamNumber, createMockRoom());

		await teamCommand.execute(setup.mockInteraction as never, mockCtx);

		return setup;
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("初期表示: チーム一覧 + cancel/confirm/rerollボタンが表示される", async () => {
		const { mockInteraction } = await setupTeamCommand();

		const editReplyCall = mockInteraction.editReply.mock.calls[0][0] as {
			content: string;
			components: Array<{ components: Array<{ data: { custom_id: string } }> }>;
		};

		expect(editReplyCall.content).toContain("チーム1");
		expect(editReplyCall.content).toContain("チーム2");

		const buttonIds = editReplyCall.components[0].components.map((c) => c.data.custom_id);
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

	it("reroll後: 新しいチーム一覧が表示される（同じcancel/confirm/rerollボタン行）", async () => {
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

		const buttonIds = updateArgs.components[0].components.map((c) => c.data.custom_id);
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
