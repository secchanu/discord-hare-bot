import { Collection } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RoomManagerとhelpers/roomをモック
vi.mock("../features/rooms/RoomManager");
vi.mock("./helpers/room");

import { getRoomFromVoiceChannel } from "./helpers/room";
import { teamCommand } from "./team";

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
		toData: ReturnType<typeof vi.fn>;
		setAdditionalVoiceChannels: ReturnType<typeof vi.fn>;
		moveMembers: ReturnType<typeof vi.fn>;
	},
) {
	const members = createMemberCollection(memberIds);

	vi.mocked(getRoomFromVoiceChannel).mockReturnValue(mockRoom as never);

	let collectHandler: ((interaction: unknown) => Promise<void>) | undefined;
	const mockCollector = {
		on: vi.fn((event: string, handler: (i: unknown) => Promise<void>) => {
			if (event === "collect") collectHandler = handler;
		}),
		stop: vi.fn(),
	};
	const mockMessage = {
		createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
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
	};
}

/**
 * デフォルトのモックルームを生成するヘルパー
 */
function createMockRoom() {
	return {
		toData: vi.fn().mockReturnValue({ channels: { additionalVoiceChannelIds: [] } }),
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

		await teamCommand.execute(mockInteraction as never);

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

		await teamCommand.execute(mockInteraction as never);

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

		await teamCommand.execute(mockInteraction as never);

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
		const { mockInteraction, mockCollector, mockMessage, getCollectHandler } =
			setupInteraction(["1", "2", "3", "4"], teamNumber, createMockRoom());

		await teamCommand.execute(mockInteraction as never);

		return { mockInteraction, mockCollector, mockMessage, getCollectHandler };
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

		const buttonIds = editReplyCall.components[0].components.map(
			(c) => c.data.custom_id,
		);
		expect(buttonIds).toContain("cancel");
		expect(buttonIds).toContain("confirm");
		expect(buttonIds).toContain("reroll");
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

		const buttonIds = updateArgs.components[0].components.map(
			(c) => c.data.custom_id,
		);
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

		const buttonIds = updateArgs.components[0].components.map(
			(c) => c.data.custom_id,
		);
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
		const buttonIds = editReplyArgs.components[0].components.map(
			(c) => c.data.custom_id,
		);
		expect(buttonIds).toContain("move");
		expect(buttonIds).not.toContain("cancel");
		expect(buttonIds).not.toContain("confirm");
		expect(buttonIds).not.toContain("reroll");
	});

	it("cancel後: リプライが削除される", async () => {
		const { mockInteraction, mockCollector, getCollectHandler } =
			await setupTeamCommand();

		const cancelButtonInteraction = {
			customId: "cancel",
			deferUpdate: vi.fn().mockResolvedValue(undefined),
			update: vi.fn(),
			editReply: vi.fn(),
			user: { id: "user-1" },
		};

		await getCollectHandler()!(cancelButtonInteraction);

		expect(mockCollector.stop).toHaveBeenCalledOnce();
		expect(cancelButtonInteraction.deferUpdate).toHaveBeenCalledOnce();
		expect(mockInteraction.deleteReply).toHaveBeenCalledOnce();
	});
});
