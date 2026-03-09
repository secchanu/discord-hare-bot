import type { ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../bot/config";
import { RoomManager } from "../../features/rooms/RoomManager";
import { RoomStore } from "../../features/rooms/RoomStore";
import { handleGame } from "./game";

vi.mock("../../bot/config", () => ({
	config: {
		ignoreRoleIds: ["ignore-role-id"],
		ignoreRoles: [{ id: "ignore-role-id", note: "テスト用無視ロール" }],
	},
}));

vi.mock("../../types/guards", () => ({
	hasRoleManager: vi.fn().mockReturnValue(true),
	hasVoiceState: vi.fn().mockReturnValue(true),
}));

vi.mock("../../features/rooms/RoomManager", () => ({
	RoomManager: {
		getInstance: vi.fn(),
	},
}));

vi.mock("../../features/rooms/RoomStore", () => ({
	RoomStore: {
		getInstance: vi.fn(),
	},
}));

const mockRoomStore = {
	set: vi.fn(),
};

const mockRoom = {
	id: "category-id",
	setGame: vi.fn(),
	toData: vi.fn().mockReturnValue({}),
};

const mockRoomManager = {
	get: vi.fn(),
};

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
	return {
		inCachedGuild: vi.fn().mockReturnValue(true),
		channel: { id: "text-channel-id", parentId: "category-id" },
		guild: { id: "guild-id" },
		member: {
			roles: {
				cache: {
					has: vi.fn().mockReturnValue(true),
				},
			},
		},
		options: {
			getRole: vi.fn().mockReturnValue({ id: "game-role-id", name: "ゲームA" }),
		},
		user: { id: "user-id" },
		reply: vi.fn().mockResolvedValue(undefined),
		deferReply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as unknown as ChatInputCommandInteraction;
}

describe("/room game", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(RoomManager.getInstance).mockReturnValue(
			mockRoomManager as unknown as RoomManager,
		);
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockRoomStore as unknown as RoomStore,
		);
		mockRoomManager.get.mockReturnValue(mockRoom);
		mockRoom.setGame.mockResolvedValue({ id: "game-role-id", name: "ゲームA", data: {} });
	});

	it("ギルド外から実行した場合はエラーを返す", async () => {
		const interaction = makeInteraction({
			inCachedGuild: vi.fn().mockReturnValue(false),
			channel: null,
		});
		await handleGame(interaction);
		expect(interaction.reply).toHaveBeenCalledWith(
			expect.objectContaining({ ephemeral: true }),
		);
		expect(interaction.deferReply).not.toHaveBeenCalled();
	});

	it("ルーム外から実行した場合はエラーを返す", async () => {
		mockRoomManager.get.mockReturnValue(undefined);
		const interaction = makeInteraction();
		await handleGame(interaction);
		expect(interaction.editReply).toHaveBeenCalledWith(
			expect.stringContaining("ルーム内でのみ"),
		);
	});

	it("ignoreRoleIds に含まれるロールは「選択できません」を返す", async () => {
		const interaction = makeInteraction({
			options: {
				getRole: vi.fn().mockReturnValue({ id: "ignore-role-id", name: "無視ロール" }),
			},
		});
		await handleGame(interaction);
		expect(interaction.editReply).toHaveBeenCalledWith(
			expect.stringContaining("選択できません"),
		);
		expect(mockRoom.setGame).not.toHaveBeenCalled();
	});

	it("メンバーがロールを持っていない場合は「付与されていない」を返す", async () => {
		const interaction = makeInteraction({
			member: {
				roles: {
					cache: {
						has: vi.fn().mockReturnValue(false),
					},
				},
			},
		});
		await handleGame(interaction);
		expect(interaction.editReply).toHaveBeenCalledWith(
			expect.stringContaining("付与されていない"),
		);
		expect(mockRoom.setGame).not.toHaveBeenCalled();
	});

	it("setGame が null を返した場合はエラーを返す", async () => {
		mockRoom.setGame.mockResolvedValue(null);
		const interaction = makeInteraction();
		await handleGame(interaction);
		expect(interaction.editReply).toHaveBeenCalledWith(
			expect.stringContaining("選択できません"),
		);
	});

	it("正常にゲームを変更した場合は変更後のゲーム名を含むメッセージを返す", async () => {
		const interaction = makeInteraction();
		await handleGame(interaction);
		expect(mockRoom.setGame).toHaveBeenCalledWith("game-role-id");
		expect(mockRoomStore.set).toHaveBeenCalledWith("category-id", expect.anything());
		expect(interaction.editReply).toHaveBeenCalledWith(
			expect.stringContaining("ゲームA"),
		);
	});
});
