import { Collection } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotConfig } from "../../bot/config";
import type { RoomManager } from "../rooms/RoomManager";
import { EventRoomManager } from "./EventRoomManager";

const testConfig: BotConfig = {
	botToken: "token",
	guildId: "guild-id",
	readyChannelId: "ready-channel-id",
	wantedChannelId: "wanted-channel-id",
	ignoreRoleIds: [],
};

const mockRoomManager = {
	findByEventId: vi.fn(),
	createReservedRoom: vi.fn(),
	removeRoom: vi.fn(),
};

function createManager(): EventRoomManager {
	return new EventRoomManager(mockRoomManager as unknown as RoomManager, testConfig);
}

describe("EventRoomManager", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRoomManager.findByEventId.mockReturnValue(undefined);
		mockRoomManager.removeRoom.mockResolvedValue(true);
	});

	describe("createEventRoom()", () => {
		it("channelIdがreadyChannelIdでない場合は何もしない", async () => {
			const event = {
				id: "event-id",
				channelId: "other-channel-id",
				guild: {},
			};

			const manager = createManager();
			await manager.createEventRoom(event as never);

			expect(mockRoomManager.createReservedRoom).not.toHaveBeenCalled();
		});

		it("guildがnullの場合は何もしない", async () => {
			const event = {
				id: "event-id",
				channelId: "ready-channel-id",
				guild: null,
			};

			const manager = createManager();
			await manager.createEventRoom(event as never);

			expect(mockRoomManager.createReservedRoom).not.toHaveBeenCalled();
		});

		it("既にこのイベントのルームが存在する場合は二重作成しない", async () => {
			mockRoomManager.findByEventId.mockReturnValue({ id: "existing-room" });

			const event = {
				id: "event-id",
				channelId: "ready-channel-id",
				guild: { id: "guild-id" },
			};

			const manager = createManager();
			await manager.createEventRoom(event as never);

			expect(mockRoomManager.createReservedRoom).not.toHaveBeenCalled();
		});

		it("イベント名・イベントIDで予約ルームが作成される", async () => {
			const mockRoom = {
				voiceChannel: { id: "vc-id" },
				setTextChannelVisibility: vi.fn().mockResolvedValue(undefined),
			};
			mockRoomManager.createReservedRoom.mockResolvedValue(mockRoom);

			const event = {
				id: "event-id",
				channelId: "ready-channel-id",
				guild: { id: "guild-id" },
				name: "テストイベント",
				channel: null,
				edit: vi.fn().mockResolvedValue(undefined),
				fetchSubscribers: vi.fn().mockResolvedValue(new Collection()),
			};

			const manager = createManager();
			await manager.createEventRoom(event as never);

			expect(mockRoomManager.createReservedRoom).toHaveBeenCalledWith(
				event.guild,
				expect.objectContaining({
					hostname: "テストイベント",
					eventId: "event-id",
				}),
			);
		});

		it("作成後にイベントのVCがルームのVCに更新される", async () => {
			const mockVoiceChannel = { id: "new-vc-id" };
			const mockRoom = {
				voiceChannel: mockVoiceChannel,
				setTextChannelVisibility: vi.fn().mockResolvedValue(undefined),
			};
			mockRoomManager.createReservedRoom.mockResolvedValue(mockRoom);

			const mockEdit = vi.fn().mockResolvedValue(undefined);
			const event = {
				id: "event-id",
				channelId: "ready-channel-id",
				guild: { id: "guild-id" },
				name: "テストイベント",
				channel: null,
				edit: mockEdit,
				fetchSubscribers: vi.fn().mockResolvedValue(new Collection()),
			};

			const manager = createManager();
			await manager.createEventRoom(event as never);

			expect(mockEdit).toHaveBeenCalledWith({ channel: mockVoiceChannel });
		});

		it("イベント参加者全員にテキストチャンネルの閲覧権限が付与される", async () => {
			const mockSetVisibility = vi.fn().mockResolvedValue(undefined);
			const mockRoom = {
				voiceChannel: { id: "vc-id" },
				setTextChannelVisibility: mockSetVisibility,
			};
			mockRoomManager.createReservedRoom.mockResolvedValue(mockRoom);

			const userA = { id: "user-a" };
			const userB = { id: "user-b" };
			const subscribers = new Collection<string, { user: unknown }>();
			subscribers.set("user-a", { user: userA });
			subscribers.set("user-b", { user: userB });

			const event = {
				id: "event-id",
				channelId: "ready-channel-id",
				guild: { id: "guild-id" },
				name: "テストイベント",
				channel: null,
				edit: vi.fn().mockResolvedValue(undefined),
				fetchSubscribers: vi.fn().mockResolvedValue(subscribers),
			};

			const manager = createManager();
			await manager.createEventRoom(event as never);

			expect(mockSetVisibility).toHaveBeenCalledTimes(2);
			expect(mockSetVisibility).toHaveBeenCalledWith(userA, true);
			expect(mockSetVisibility).toHaveBeenCalledWith(userB, true);
		});

		it("ルーム作成が失敗してもエラーをスローしない", async () => {
			mockRoomManager.createReservedRoom.mockRejectedValue(new Error("作成失敗"));
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

			const event = {
				id: "event-id",
				channelId: "ready-channel-id",
				guild: { id: "guild-id" },
				name: "テストイベント",
				channel: null,
			};

			const manager = createManager();
			await expect(manager.createEventRoom(event as never)).resolves.toBeUndefined();

			consoleErrorSpy.mockRestore();
		});
	});

	describe("deleteEventRoom()", () => {
		it("イベントIDからルームを特定し、予約解除して削除する", async () => {
			const mockRoom = { unreserve: vi.fn() };
			mockRoomManager.findByEventId.mockReturnValue(mockRoom);

			// channel が null（Partial イベント）でも eventId で削除できる
			const event = { id: "event-id", channel: null };

			const manager = createManager();
			await manager.deleteEventRoom(event as never);

			expect(mockRoomManager.findByEventId).toHaveBeenCalledWith("event-id");
			expect(mockRoom.unreserve).toHaveBeenCalled();
			expect(mockRoomManager.removeRoom).toHaveBeenCalledWith(mockRoom);
		});

		it("対応するルームが存在しない場合は何もしない", async () => {
			mockRoomManager.findByEventId.mockReturnValue(undefined);

			const event = { id: "event-unknown", channel: null };

			const manager = createManager();
			await manager.deleteEventRoom(event as never);

			expect(mockRoomManager.removeRoom).not.toHaveBeenCalled();
		});
	});

	describe("updateEventRoom()", () => {
		function makeEvent(overrides: Record<string, unknown> = {}) {
			return {
				id: "event-id",
				isActive: vi.fn().mockReturnValue(false),
				isCompleted: vi.fn().mockReturnValue(false),
				isCanceled: vi.fn().mockReturnValue(false),
				channelId: "ready-channel-id",
				channel: null,
				guild: { id: "guild-id" },
				name: "イベント",
				edit: vi.fn().mockResolvedValue(undefined),
				fetchSubscribers: vi.fn().mockResolvedValue(new Collection()),
				...overrides,
			};
		}

		it("アクティブなイベントは何もしない", async () => {
			const newEvent = makeEvent({ isActive: vi.fn().mockReturnValue(true) });

			const manager = createManager();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoomManager.findByEventId).not.toHaveBeenCalled();
			expect(mockRoomManager.createReservedRoom).not.toHaveBeenCalled();
		});

		it("イベント完了時にルームを削除する", async () => {
			const mockRoom = { unreserve: vi.fn() };
			mockRoomManager.findByEventId.mockReturnValue(mockRoom);

			const newEvent = makeEvent({ isCompleted: vi.fn().mockReturnValue(true) });

			const manager = createManager();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoom.unreserve).toHaveBeenCalled();
			expect(mockRoomManager.removeRoom).toHaveBeenCalledWith(mockRoom);
		});

		it("イベントキャンセル時にルームを削除する", async () => {
			const mockRoom = { unreserve: vi.fn() };
			mockRoomManager.findByEventId.mockReturnValue(mockRoom);

			const newEvent = makeEvent({ isCanceled: vi.fn().mockReturnValue(true) });

			const manager = createManager();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoom.unreserve).toHaveBeenCalled();
			expect(mockRoomManager.removeRoom).toHaveBeenCalledWith(mockRoom);
		});

		it("イベントのチャンネルがルームのVCに変更された場合（自分での付け替え）は何もしない", async () => {
			const mockRoom = {
				unreserve: vi.fn(),
				hasVoiceChannel: vi.fn().mockReturnValue(true),
			};
			mockRoomManager.findByEventId.mockReturnValue(mockRoom);

			const newEvent = makeEvent({ channelId: "room-vc-id" });

			const manager = createManager();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoomManager.removeRoom).not.toHaveBeenCalled();
			expect(mockRoomManager.createReservedRoom).not.toHaveBeenCalled();
		});

		it("ルームが既にあり準備チャンネルに再設定された場合は二重作成しない", async () => {
			const mockRoom = {
				unreserve: vi.fn(),
				hasVoiceChannel: vi.fn().mockReturnValue(false),
			};
			mockRoomManager.findByEventId.mockReturnValue(mockRoom);

			const newEvent = makeEvent({ channelId: "ready-channel-id" });

			const manager = createManager();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoomManager.removeRoom).not.toHaveBeenCalled();
			expect(mockRoomManager.createReservedRoom).not.toHaveBeenCalled();
		});

		it("イベントがルーム外のチャンネルへ変更された場合はルームを解体する", async () => {
			const mockRoom = {
				unreserve: vi.fn(),
				hasVoiceChannel: vi.fn().mockReturnValue(false),
			};
			mockRoomManager.findByEventId.mockReturnValue(mockRoom);

			const newEvent = makeEvent({ channelId: "unrelated-channel-id" });

			const manager = createManager();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoom.unreserve).toHaveBeenCalled();
			expect(mockRoomManager.removeRoom).toHaveBeenCalledWith(mockRoom);
		});

		it("ルームがなく準備チャンネルに設定された場合はルームを新規作成する", async () => {
			mockRoomManager.findByEventId.mockReturnValue(undefined);
			const mockRoom = {
				voiceChannel: { id: "vc-id" },
				setTextChannelVisibility: vi.fn().mockResolvedValue(undefined),
			};
			mockRoomManager.createReservedRoom.mockResolvedValue(mockRoom);

			const newEvent = makeEvent({ channelId: "ready-channel-id" });

			const manager = createManager();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoomManager.createReservedRoom).toHaveBeenCalled();
		});

		it("ルームがなく準備チャンネル以外に設定された場合は何もしない", async () => {
			mockRoomManager.findByEventId.mockReturnValue(undefined);

			const newEvent = makeEvent({ channelId: "other-channel-id" });

			const manager = createManager();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoomManager.createReservedRoom).not.toHaveBeenCalled();
			expect(mockRoomManager.removeRoom).not.toHaveBeenCalled();
		});
	});

	describe("addUserToEventRoom()", () => {
		it("対応するルームが存在する場合、ユーザーにテキストチャンネルの閲覧権限を付与する", async () => {
			const mockSetVisibility = vi.fn().mockResolvedValue(undefined);
			mockRoomManager.findByEventId.mockReturnValue({
				setTextChannelVisibility: mockSetVisibility,
			});

			const user = { id: "user-1" };
			// channel が null（Partial イベント）でも eventId で解決できる
			const event = { id: "event-id", channel: null };

			const manager = createManager();
			await manager.addUserToEventRoom(event as never, user as never);

			expect(mockRoomManager.findByEventId).toHaveBeenCalledWith("event-id");
			expect(mockSetVisibility).toHaveBeenCalledWith(user, true);
		});

		it("対応するルームが存在しない場合は何もしない", async () => {
			mockRoomManager.findByEventId.mockReturnValue(undefined);

			const user = { id: "user-1" };
			const event = { id: "event-unknown", channel: null };

			const manager = createManager();
			await expect(
				manager.addUserToEventRoom(event as never, user as never),
			).resolves.toBeUndefined();
		});
	});

	describe("removeUserFromEventRoom()", () => {
		it("対応するルームが存在する場合、ユーザーのテキストチャンネル閲覧権限を剥奪する", async () => {
			const mockSetVisibility = vi.fn().mockResolvedValue(undefined);
			mockRoomManager.findByEventId.mockReturnValue({
				setTextChannelVisibility: mockSetVisibility,
			});

			const user = { id: "user-1" };
			const event = { id: "event-id", channel: null };

			const manager = createManager();
			await manager.removeUserFromEventRoom(event as never, user as never);

			expect(mockSetVisibility).toHaveBeenCalledWith(user, false);
		});

		it("対応するルームが存在しない場合は何もしない", async () => {
			mockRoomManager.findByEventId.mockReturnValue(undefined);

			const user = { id: "user-1" };
			const event = { id: "event-unknown", channel: null };

			const manager = createManager();
			await expect(
				manager.removeUserFromEventRoom(event as never, user as never),
			).resolves.toBeUndefined();
		});
	});
});
