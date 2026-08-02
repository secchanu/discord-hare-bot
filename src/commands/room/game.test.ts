import type { ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../../bot/context";
import { handleGame } from "./game";

vi.mock("../../types/guards", () => ({
	hasRoleManager: vi.fn().mockReturnValue(true),
	hasVoiceState: vi.fn().mockReturnValue(true),
}));

const mockRoom = {
	id: "category-id",
};

const mockRoomManager = {
	get: vi.fn(),
	changeGame: vi.fn(),
};

const mockCtx = {
	roomManager: mockRoomManager,
	config: {
		ignoreRoleIds: ["ignore-role-id"],
		ignoreRoles: [{ id: "ignore-role-id", note: "テスト用無視ロール" }],
	},
} as unknown as AppContext;

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
		mockRoomManager.get.mockReturnValue(mockRoom);
		mockRoomManager.changeGame.mockResolvedValue({ id: "game-role-id", name: "ゲームA", data: {} });
	});

	it("ギルド外から実行した場合はエラーを返す", async () => {
		const interaction = makeInteraction({
			inCachedGuild: vi.fn().mockReturnValue(false),
			channel: null,
		});
		await handleGame(interaction, mockCtx);
		expect(interaction.reply).toHaveBeenCalled();
		expect(interaction.deferReply).not.toHaveBeenCalled();
	});

	it("ルーム外から実行した場合はエラーを返す", async () => {
		mockRoomManager.get.mockReturnValue(undefined);
		const interaction = makeInteraction();
		await handleGame(interaction, mockCtx);
		expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("ルーム内でのみ"));
	});

	it("ignoreRoleIds に含まれるロールは「選択できません」を返す", async () => {
		const interaction = makeInteraction({
			options: {
				getRole: vi.fn().mockReturnValue({ id: "ignore-role-id", name: "無視ロール" }),
			},
		});
		await handleGame(interaction, mockCtx);
		expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("選択できません"));
		expect(mockRoomManager.changeGame).not.toHaveBeenCalled();
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
		await handleGame(interaction, mockCtx);
		expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("付与されていない"));
		expect(mockRoomManager.changeGame).not.toHaveBeenCalled();
	});

	it("changeGame が null を返した場合はエラーを返す", async () => {
		mockRoomManager.changeGame.mockResolvedValue(null);
		const interaction = makeInteraction();
		await handleGame(interaction, mockCtx);
		expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("選択できません"));
	});

	it("正常にゲームを変更した場合は変更後のゲーム名を含むメッセージを返す", async () => {
		const interaction = makeInteraction();
		await handleGame(interaction, mockCtx);
		expect(mockRoomManager.changeGame).toHaveBeenCalledWith(mockRoom, "game-role-id");
		expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("ゲームA"));
	});
});
