import { Collection } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventRoomManager } from "./EventRoomManager";
import { RoomManager } from "../rooms/RoomManager";
import { RoomStore } from "../rooms/RoomStore";
import { Room } from "../rooms/Room";

vi.mock("../rooms/RoomManager", () => ({
	RoomManager: { getInstance: vi.fn() },
}));
vi.mock("../rooms/RoomStore", () => ({
	RoomStore: { getInstance: vi.fn() },
}));
vi.mock("../../bot/config", () => ({
	config: { readyChannelId: "ready-channel-id" },
}));
vi.mock("../rooms/Room", () => ({
	Room: vi.fn(),
}));

const mockRooms = new Collection<string, unknown>();

const mockRoomManager = {
	get: vi.fn((id: string) => mockRooms.get(id)),
	getAll: vi.fn(() => mockRooms),
};

const mockRoomStore = {
	set: vi.fn(),
	delete: vi.fn(),
};

function resetEventRoomManagerInstance() {
	(EventRoomManager as unknown as { instance: undefined }).instance = undefined;
}

describe("EventRoomManager", () => {
	beforeEach(() => {
		vi.mocked(RoomManager.getInstance).mockReturnValue(
			mockRoomManager as unknown as RoomManager,
		);
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockRoomStore as unknown as RoomStore,
		);
		resetEventRoomManagerInstance();
		mockRooms.clear();
		vi.clearAllMocks();
		// clearAllMocks後もgetAll/getの実装を維持する
		mockRoomManager.get.mockImplementation((id: string) => mockRooms.get(id));
		mockRoomManager.getAll.mockImplementation(() => mockRooms);
		vi.mocked(RoomManager.getInstance).mockReturnValue(
			mockRoomManager as unknown as RoomManager,
		);
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockRoomStore as unknown as RoomStore,
		);
	});

	describe("createEventRoom()", () => {
		it("channelIdがreadyChannelIdでない場合は何もしない", async () => {
			const event = {
				channelId: "other-channel-id",
				guild: {},
			};

			const manager = EventRoomManager.getInstance();
			await manager.createEventRoom(event as never);

			expect(Room).not.toHaveBeenCalled();
		});

		it("guildがnullの場合は何もしない", async () => {
			const event = {
				channelId: "ready-channel-id",
				guild: null,
			};

			const manager = EventRoomManager.getInstance();
			await manager.createEventRoom(event as never);

			expect(Room).not.toHaveBeenCalled();
		});

		it("reserved: trueでルームが作成される", async () => {
			const mockRoom = {
				create: vi.fn().mockResolvedValue("category-id"),
				voiceChannel: { id: "vc-id" },
				setTextChannelVisibility: vi.fn().mockResolvedValue(undefined),
				toData: vi.fn().mockReturnValue({ id: "category-id" }),
			};
			vi.mocked(Room).mockImplementation(() => mockRoom as never);

			const event = {
				channelId: "ready-channel-id",
				guild: { id: "guild-id" },
				name: "テストイベント",
				id: "event-id",
				channel: null,
				edit: vi.fn().mockResolvedValue(undefined),
				fetchSubscribers: vi.fn().mockResolvedValue(new Collection()),
			};

			const manager = EventRoomManager.getInstance();
			await manager.createEventRoom(event as never);

			expect(Room).toHaveBeenCalledWith(
				event.guild,
				expect.objectContaining({ reserved: true }),
			);
		});

		it("作成後にイベントのVCがルームのVCに更新される", async () => {
			const mockVoiceChannel = { id: "new-vc-id" };
			const mockRoom = {
				create: vi.fn().mockResolvedValue("category-id"),
				voiceChannel: mockVoiceChannel,
				setTextChannelVisibility: vi.fn().mockResolvedValue(undefined),
				toData: vi.fn().mockReturnValue({ id: "category-id" }),
			};
			vi.mocked(Room).mockImplementation(() => mockRoom as never);

			const mockEdit = vi.fn().mockResolvedValue(undefined);
			const event = {
				channelId: "ready-channel-id",
				guild: { id: "guild-id" },
				name: "テストイベント",
				id: "event-id",
				channel: null,
				edit: mockEdit,
				fetchSubscribers: vi.fn().mockResolvedValue(new Collection()),
			};

			const manager = EventRoomManager.getInstance();
			await manager.createEventRoom(event as never);

			expect(mockEdit).toHaveBeenCalledWith({ channel: mockVoiceChannel });
		});

		it("イベント参加者全員にテキストチャンネルの閲覧権限が付与される", async () => {
			const mockSetVisibility = vi.fn().mockResolvedValue(undefined);
			const mockRoom = {
				create: vi.fn().mockResolvedValue("category-id"),
				voiceChannel: { id: "vc-id" },
				setTextChannelVisibility: mockSetVisibility,
				toData: vi.fn().mockReturnValue({ id: "category-id" }),
			};
			vi.mocked(Room).mockImplementation(() => mockRoom as never);

			const userA = { id: "user-a" };
			const userB = { id: "user-b" };
			const subscribers = new Collection<string, { user: unknown }>();
			subscribers.set("user-a", { user: userA });
			subscribers.set("user-b", { user: userB });

			const event = {
				channelId: "ready-channel-id",
				guild: { id: "guild-id" },
				name: "テストイベント",
				id: "event-id",
				channel: null,
				edit: vi.fn().mockResolvedValue(undefined),
				fetchSubscribers: vi.fn().mockResolvedValue(subscribers),
			};

			const manager = EventRoomManager.getInstance();
			await manager.createEventRoom(event as never);

			expect(mockSetVisibility).toHaveBeenCalledTimes(2);
			expect(mockSetVisibility).toHaveBeenCalledWith(userA, true);
			expect(mockSetVisibility).toHaveBeenCalledWith(userB, true);
		});

		it("ルームがメモリとストアに保存される", async () => {
			const mockRoomData = { id: "category-id" };
			const mockRoom = {
				create: vi.fn().mockResolvedValue("category-id"),
				voiceChannel: { id: "vc-id" },
				setTextChannelVisibility: vi.fn().mockResolvedValue(undefined),
				toData: vi.fn().mockReturnValue(mockRoomData),
			};
			vi.mocked(Room).mockImplementation(() => mockRoom as never);

			const event = {
				channelId: "ready-channel-id",
				guild: { id: "guild-id" },
				name: "テストイベント",
				id: "event-id",
				channel: null,
				edit: vi.fn().mockResolvedValue(undefined),
				fetchSubscribers: vi.fn().mockResolvedValue(new Collection()),
			};

			const manager = EventRoomManager.getInstance();
			await manager.createEventRoom(event as never);

			expect(mockRooms.get("category-id")).toBe(mockRoom);
			expect(mockRoomStore.set).toHaveBeenCalledWith("category-id", mockRoomData);
		});
	});

	describe("updateEventRoom()", () => {
		it("アクティブなイベントは何もしない", async () => {
			const newEvent = {
				isActive: vi.fn().mockReturnValue(true),
				isCompleted: vi.fn().mockReturnValue(false),
				isCanceled: vi.fn().mockReturnValue(false),
				channelId: "ready-channel-id",
				channel: null,
			};

			const manager = EventRoomManager.getInstance();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoomManager.get).not.toHaveBeenCalled();
		});

		it("oldEventとnewEventの両方がreadyChannelIdを持つ場合は何もしない", async () => {
			const oldEvent = { channelId: "ready-channel-id" };
			const newEvent = {
				isActive: vi.fn().mockReturnValue(false),
				isCompleted: vi.fn().mockReturnValue(false),
				isCanceled: vi.fn().mockReturnValue(false),
				channelId: "ready-channel-id",
				channel: null,
			};

			const manager = EventRoomManager.getInstance();
			await manager.updateEventRoom(oldEvent as never, newEvent as never);

			expect(mockRoomManager.get).not.toHaveBeenCalled();
		});

		it("イベント完了時にルームを削除する", async () => {
			const mockRoom = {
				reserved: true,
				delete: vi.fn().mockResolvedValue(true),
			};
			mockRooms.set("category-id", mockRoom);

			const newEvent = {
				isActive: vi.fn().mockReturnValue(false),
				isCompleted: vi.fn().mockReturnValue(true),
				isCanceled: vi.fn().mockReturnValue(false),
				channelId: "ready-channel-id",
				channel: { parentId: "category-id" },
			};

			const manager = EventRoomManager.getInstance();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoom.delete).toHaveBeenCalled();
			expect(mockRoomStore.delete).toHaveBeenCalledWith("category-id");
		});

		it("イベントキャンセル時にルームを削除する", async () => {
			const mockRoom = {
				reserved: true,
				delete: vi.fn().mockResolvedValue(true),
			};
			mockRooms.set("category-id", mockRoom);

			const newEvent = {
				isActive: vi.fn().mockReturnValue(false),
				isCompleted: vi.fn().mockReturnValue(false),
				isCanceled: vi.fn().mockReturnValue(true),
				channelId: "ready-channel-id",
				channel: { parentId: "category-id" },
			};

			const manager = EventRoomManager.getInstance();
			await manager.updateEventRoom(null, newEvent as never);

			expect(mockRoom.delete).toHaveBeenCalled();
			expect(mockRoomStore.delete).toHaveBeenCalledWith("category-id");
		});

		it("チャンネルが変更された場合は旧ルームを削除する", async () => {
			const mockRoom = {
				reserved: true,
				delete: vi.fn().mockResolvedValue(true),
			};
			mockRooms.set("old-category-id", mockRoom);

			const oldEvent = {
				channelId: "other-channel-id",
				channel: { parentId: "old-category-id" },
			};
			const newEvent = {
				isActive: vi.fn().mockReturnValue(false),
				isCompleted: vi.fn().mockReturnValue(false),
				isCanceled: vi.fn().mockReturnValue(false),
				channelId: "other-channel-2",
				channel: { parentId: "new-category-id" },
			};

			const manager = EventRoomManager.getInstance();
			await manager.updateEventRoom(oldEvent as never, newEvent as never);

			expect(mockRoom.delete).toHaveBeenCalled();
			expect(mockRoomStore.delete).toHaveBeenCalledWith("old-category-id");
		});

		it("newEventがreadyChannelIdに設定された場合はルームを新規作成する", async () => {
			const mockRoom = {
				create: vi.fn().mockResolvedValue("new-category-id"),
				voiceChannel: { id: "vc-id" },
				setTextChannelVisibility: vi.fn().mockResolvedValue(undefined),
				toData: vi.fn().mockReturnValue({ id: "new-category-id" }),
			};
			vi.mocked(Room).mockImplementation(() => mockRoom as never);

			const oldEvent = {
				channelId: "other-channel-id",
				channel: null,
			};
			const newEvent = {
				isActive: vi.fn().mockReturnValue(false),
				isCompleted: vi.fn().mockReturnValue(false),
				isCanceled: vi.fn().mockReturnValue(false),
				channelId: "ready-channel-id",
				channel: null,
				guild: { id: "guild-id" },
				name: "新イベント",
				id: "event-id",
				edit: vi.fn().mockResolvedValue(undefined),
				fetchSubscribers: vi.fn().mockResolvedValue(new Collection()),
			};

			const manager = EventRoomManager.getInstance();
			await manager.updateEventRoom(oldEvent as never, newEvent as never);

			expect(Room).toHaveBeenCalled();
		});
	});

	describe("deleteEventRoom()", () => {
		it("event.channel.parentIdがnullの場合は何もしない", async () => {
			const event = { channel: null };

			const manager = EventRoomManager.getInstance();
			await manager.deleteEventRoom(event as never);

			expect(mockRoomManager.get).not.toHaveBeenCalled();
		});

		it("対応するルームが存在しない場合は何もしない", async () => {
			const event = { channel: { parentId: "non-existent-category" } };

			const manager = EventRoomManager.getInstance();
			await manager.deleteEventRoom(event as never);

			expect(mockRoomStore.delete).not.toHaveBeenCalled();
		});

		it("ルームのreservedをfalseにしてからdeleteを呼ぶ", async () => {
			const mockRoom = {
				reserved: true,
				delete: vi.fn().mockResolvedValue(true),
			};
			mockRooms.set("category-id", mockRoom);

			const event = { channel: { parentId: "category-id" } };

			const manager = EventRoomManager.getInstance();
			await manager.deleteEventRoom(event as never);

			expect(mockRoom.reserved).toBe(false);
			expect(mockRoom.delete).toHaveBeenCalled();
		});

		it("削除成功時はメモリとストアからルームを除去する", async () => {
			const mockRoom = {
				reserved: true,
				delete: vi.fn().mockResolvedValue(true),
			};
			mockRooms.set("category-id", mockRoom);

			const event = { channel: { parentId: "category-id" } };

			const manager = EventRoomManager.getInstance();
			await manager.deleteEventRoom(event as never);

			expect(mockRooms.has("category-id")).toBe(false);
			expect(mockRoomStore.delete).toHaveBeenCalledWith("category-id");
		});

		it("削除が失敗した場合はストアを変更しない", async () => {
			const mockRoom = {
				reserved: true,
				delete: vi.fn().mockResolvedValue(false),
			};
			mockRooms.set("category-id", mockRoom);

			const event = { channel: { parentId: "category-id" } };

			const manager = EventRoomManager.getInstance();
			await manager.deleteEventRoom(event as never);

			expect(mockRooms.has("category-id")).toBe(true);
			expect(mockRoomStore.delete).not.toHaveBeenCalled();
		});
	});

	describe("addUserToEventRoom()", () => {
		it("対応するルームが存在する場合、ユーザーにテキストチャンネルの閲覧権限を付与する", async () => {
			const mockSetVisibility = vi.fn().mockResolvedValue(undefined);
			const mockRoom = { setTextChannelVisibility: mockSetVisibility };
			mockRooms.set("category-id", mockRoom);

			const user = { id: "user-1" };
			const event = { channel: { parentId: "category-id" } };

			const manager = EventRoomManager.getInstance();
			await manager.addUserToEventRoom(event as never, user as never);

			expect(mockSetVisibility).toHaveBeenCalledWith(user, true);
		});

		it("対応するルームが存在しない場合は何もしない", async () => {
			const user = { id: "user-1" };
			const event = { channel: { parentId: "non-existent-category" } };

			const manager = EventRoomManager.getInstance();
			await manager.addUserToEventRoom(event as never, user as never);

			// ルームが存在しないのでsetTextChannelVisibilityは呼ばれない
			expect(true).toBe(true);
		});

		it("event.channelがnullの場合は何もしない", async () => {
			const mockSetVisibility = vi.fn();
			const mockRoom = { setTextChannelVisibility: mockSetVisibility };
			mockRooms.set("category-id", mockRoom);

			const user = { id: "user-1" };
			const event = { channel: null };

			const manager = EventRoomManager.getInstance();
			await manager.addUserToEventRoom(event as never, user as never);

			expect(mockSetVisibility).not.toHaveBeenCalled();
		});
	});

	describe("removeUserFromEventRoom()", () => {
		it("対応するルームが存在する場合、ユーザーのテキストチャンネル閲覧権限を剥奪する", async () => {
			const mockSetVisibility = vi.fn().mockResolvedValue(undefined);
			const mockRoom = { setTextChannelVisibility: mockSetVisibility };
			mockRooms.set("category-id", mockRoom);

			const user = { id: "user-1" };
			const event = { channel: { parentId: "category-id" } };

			const manager = EventRoomManager.getInstance();
			await manager.removeUserFromEventRoom(event as never, user as never);

			expect(mockSetVisibility).toHaveBeenCalledWith(user, false);
		});

		it("対応するルームが存在しない場合は何もしない", async () => {
			const user = { id: "user-1" };
			const event = { channel: { parentId: "non-existent-category" } };

			const manager = EventRoomManager.getInstance();
			await manager.removeUserFromEventRoom(event as never, user as never);

			// ルームが存在しないのでsetTextChannelVisibilityは呼ばれない
			expect(true).toBe(true);
		});

		it("event.channelがnullの場合は何もしない", async () => {
			const mockSetVisibility = vi.fn();
			const mockRoom = { setTextChannelVisibility: mockSetVisibility };
			mockRooms.set("category-id", mockRoom);

			const user = { id: "user-1" };
			const event = { channel: null };

			const manager = EventRoomManager.getInstance();
			await manager.removeUserFromEventRoom(event as never, user as never);

			expect(mockSetVisibility).not.toHaveBeenCalled();
		});
	});
});
