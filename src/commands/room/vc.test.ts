import type { ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../../bot/context";
import { DISCORD_LIMITS } from "../../constants";
import { handleVc } from "./vc";

const mockRoom = {
	id: "category-id",
	setAdditionalVoiceChannels: vi.fn(),
};

const mockRoomManager = {
	get: vi.fn(),
};

const mockCtx = { roomManager: mockRoomManager } as unknown as AppContext;

function makeInteraction(numberOption: number | null = 1): ChatInputCommandInteraction {
	return {
		channel: { id: "text-channel-id", parentId: "category-id" },
		options: {
			getInteger: vi.fn().mockReturnValue(numberOption),
		},
		user: { id: "user-id" },
		deferReply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
	} as unknown as ChatInputCommandInteraction;
}

describe("/room vc", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRoomManager.get.mockReturnValue(mockRoom);
		mockRoom.setAdditionalVoiceChannels.mockResolvedValue(undefined);
	});

	it("ルーム外から実行した場合はエラーを返す", async () => {
		mockRoomManager.get.mockReturnValue(undefined);
		const interaction = makeInteraction(1);
		await handleVc(interaction, mockCtx);
		expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("ルーム内でのみ"));
		expect(mockRoom.setAdditionalVoiceChannels).not.toHaveBeenCalled();
	});

	describe("境界値テスト: 指定数が 0〜MAX の範囲内にクランプされる", () => {
		it("0 を指定したとき、0 がそのまま渡される", async () => {
			const interaction = makeInteraction(0);
			await handleVc(interaction, mockCtx);
			expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(0);
		});

		it("MAX を指定したとき、MAX がそのまま渡される", async () => {
			const interaction = makeInteraction(DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS);
			await handleVc(interaction, mockCtx);
			expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(
				DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS,
			);
		});

		it("MAX+1 を指定したとき、MAX にクランプされる", async () => {
			const interaction = makeInteraction(DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS + 1);
			await handleVc(interaction, mockCtx);
			expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(
				DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS,
			);
		});

		it("負の値を指定したとき、0 にクランプされる", async () => {
			const interaction = makeInteraction(-1);
			await handleVc(interaction, mockCtx);
			expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(0);
		});
	});

	it("正常に変更した場合は完了メッセージを返す", async () => {
		const interaction = makeInteraction(3);
		await handleVc(interaction, mockCtx);
		expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(3);
		expect(interaction.editReply).toHaveBeenLastCalledWith(expect.stringContaining("3"));
	});

	it("setAdditionalVoiceChannels がエラーをスローした場合はエラーメッセージを返す", async () => {
		mockRoom.setAdditionalVoiceChannels.mockRejectedValue(new Error("Discord API error"));
		const interaction = makeInteraction(2);
		await handleVc(interaction, mockCtx);
		expect(interaction.editReply).toHaveBeenLastCalledWith(expect.stringContaining("エラー"));
	});
});
