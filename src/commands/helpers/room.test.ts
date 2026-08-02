import type { ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomManager } from "../../features/rooms/RoomManager";
import { getRoomFromTextChannel, getRoomFromVoiceChannel } from "./room";

// GuildMemberRoleManager を使うガード関数が通るよう、hasRoleManager をモック
vi.mock("../../types/guards", () => ({
	hasRoleManager: vi.fn().mockReturnValue(true),
}));

const mockGet = vi.fn();
const mockRoomManager = { get: mockGet } as unknown as RoomManager;

beforeEach(() => {
	mockGet.mockReset();
});

describe("getRoomFromVoiceChannel", () => {
	it("VCのparentIdからルームを取得できる", () => {
		const mockRoom = { id: "room-id" };
		mockGet.mockReturnValue(mockRoom);

		const interaction = {
			member: {
				voice: {
					channel: { parentId: "category-id" },
				},
			},
		} as unknown as ChatInputCommandInteraction;

		const result = getRoomFromVoiceChannel(interaction, mockRoomManager);
		expect(mockGet).toHaveBeenCalledWith("category-id");
		expect(result).toBe(mockRoom);
	});

	it("memberがnullの場合は null を返す", () => {
		const interaction = {
			member: null,
		} as unknown as ChatInputCommandInteraction;

		expect(getRoomFromVoiceChannel(interaction, mockRoomManager)).toBeNull();
	});

	it("VCに未接続（voice.channelがnull）の場合は null を返す", () => {
		const interaction = {
			member: {
				voice: { channel: null },
			},
		} as unknown as ChatInputCommandInteraction;

		expect(getRoomFromVoiceChannel(interaction, mockRoomManager)).toBeNull();
	});

	it("VCのparentIdがnullの場合は null を返す", () => {
		const interaction = {
			member: {
				voice: {
					channel: { parentId: null },
				},
			},
		} as unknown as ChatInputCommandInteraction;

		expect(getRoomFromVoiceChannel(interaction, mockRoomManager)).toBeNull();
	});

	it("ルームが存在しない場合は null を返す", () => {
		mockGet.mockReturnValue(undefined);

		const interaction = {
			member: {
				voice: {
					channel: { parentId: "category-id" },
				},
			},
		} as unknown as ChatInputCommandInteraction;

		expect(getRoomFromVoiceChannel(interaction, mockRoomManager)).toBeNull();
	});
});

describe("getRoomFromTextChannel", () => {
	it("テキストチャンネルのparentIdからルームを取得できる", () => {
		const mockRoom = { id: "room-id" };
		mockGet.mockReturnValue(mockRoom);

		const interaction = {
			channel: { parentId: "category-id" },
		} as unknown as ChatInputCommandInteraction;

		const result = getRoomFromTextChannel(interaction, mockRoomManager);
		expect(mockGet).toHaveBeenCalledWith("category-id");
		expect(result).toBe(mockRoom);
	});

	it("channelがnullの場合は null を返す", () => {
		const interaction = {
			channel: null,
		} as unknown as ChatInputCommandInteraction;

		expect(getRoomFromTextChannel(interaction, mockRoomManager)).toBeNull();
	});

	it("channelにparentIdプロパティがない場合は null を返す", () => {
		const interaction = {
			channel: { id: "channel-id" },
		} as unknown as ChatInputCommandInteraction;

		expect(getRoomFromTextChannel(interaction, mockRoomManager)).toBeNull();
	});

	it("ルーム外のチャンネル（parentIdがnull）から実行された場合は null を返す", () => {
		const interaction = {
			channel: { parentId: null },
		} as unknown as ChatInputCommandInteraction;

		expect(getRoomFromTextChannel(interaction, mockRoomManager)).toBeNull();
	});

	it("対応するルームが存在しない場合は null を返す", () => {
		mockGet.mockReturnValue(undefined);

		const interaction = {
			channel: { parentId: "category-id" },
		} as unknown as ChatInputCommandInteraction;

		expect(getRoomFromTextChannel(interaction, mockRoomManager)).toBeNull();
	});
});
