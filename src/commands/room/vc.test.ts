import type { ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISCORD_LIMITS } from "../../constants";
import { RoomManager } from "../../features/rooms/RoomManager";
import { RoomStore } from "../../features/rooms/RoomStore";
import { handleVc } from "./vc";

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
	setAdditionalVoiceChannels: vi.fn(),
	toData: vi.fn().mockReturnValue({}),
};

const mockRoomManager = {
	get: vi.fn(),
};

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
		vi.mocked(RoomManager.getInstance).mockReturnValue(mockRoomManager as unknown as RoomManager);
		vi.mocked(RoomStore.getInstance).mockReturnValue(mockRoomStore as unknown as RoomStore);
		mockRoomManager.get.mockReturnValue(mockRoom);
		mockRoom.setAdditionalVoiceChannels.mockResolvedValue(undefined);
	});

	it("ルーム外から実行した場合はエラーを返す", async () => {
		mockRoomManager.get.mockReturnValue(undefined);
		const interaction = makeInteraction(1);
		await handleVc(interaction);
		expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("ルーム内でのみ"));
		expect(mockRoom.setAdditionalVoiceChannels).not.toHaveBeenCalled();
	});

	describe("境界値テスト: 指定数が 0〜MAX の範囲内にクランプされる", () => {
		it("0 を指定したとき、0 がそのまま渡される", async () => {
			const interaction = makeInteraction(0);
			await handleVc(interaction);
			expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(0);
			expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("0"));
		});

		it("MAX を指定したとき、MAX がそのまま渡される", async () => {
			const interaction = makeInteraction(DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS);
			await handleVc(interaction);
			expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(
				DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS,
			);
		});

		it("MAX+1 を指定したとき、MAX にクランプされる", async () => {
			const interaction = makeInteraction(DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS + 1);
			await handleVc(interaction);
			expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(
				DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS,
			);
		});

		it("負の値を指定したとき、0 にクランプされる", async () => {
			const interaction = makeInteraction(-1);
			await handleVc(interaction);
			expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(0);
		});
	});

	it("正常に変更した場合はストアに保存してメッセージを返す", async () => {
		const interaction = makeInteraction(3);
		await handleVc(interaction);
		expect(mockRoom.setAdditionalVoiceChannels).toHaveBeenCalledWith(3);
		expect(mockRoomStore.set).toHaveBeenCalledWith("category-id", expect.anything());
		expect(interaction.editReply).toHaveBeenLastCalledWith(expect.stringContaining("3"));
	});

	it("setAdditionalVoiceChannels がエラーをスローした場合はエラーメッセージを返す", async () => {
		mockRoom.setAdditionalVoiceChannels.mockRejectedValue(new Error("Discord API error"));
		const interaction = makeInteraction(2);
		await handleVc(interaction);
		expect(interaction.editReply).toHaveBeenLastCalledWith(expect.stringContaining("エラー"));
	});
});
