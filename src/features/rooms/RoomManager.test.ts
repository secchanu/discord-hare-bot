import { Collection } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Room } from "./Room";
import { RoomManager } from "./RoomManager";
import { RoomStore } from "./RoomStore";
import type { RoomData } from "./types";

vi.mock("./Room", () => ({
	Room: vi.fn(),
}));

vi.mock("./RoomStore", () => ({
	RoomStore: { getInstance: vi.fn() },
}));

// RoomManagerはシングルトンなので各テスト前にインスタンスをリセットする
function resetRoomManager() {
	(RoomManager as unknown as { instance: undefined }).instance = undefined;
}

// プライベートプロパティへのテスト用アクセスヘルパー
function getRooms(manager: RoomManager): Collection<string, Room> {
	return (manager as unknown as { rooms: Collection<string, Room> }).rooms;
}

// RoomStoreのモックインスタンスを作成するヘルパー
function createMockStore() {
	return {
		set: vi.fn().mockResolvedValue(undefined),
		get: vi.fn(),
		has: vi.fn(),
		delete: vi.fn().mockResolvedValue(undefined),
		getAll: vi.fn().mockResolvedValue([]),
		clear: vi.fn(),
	};
}

describe("RoomManager.createRoom()", () => {
	beforeEach(() => {
		resetRoomManager();
		vi.clearAllMocks();
	});

	it("Room.create()を呼び、返ったIDでメモリとストアに保存する", async () => {
		const mockStore = createMockStore();
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockStore as unknown as RoomStore,
		);

		const roomId = "cat-001";
		const mockRoomInstance = {
			create: vi.fn().mockResolvedValue(roomId),
			moveMembers: vi.fn().mockResolvedValue(true),
			toData: vi.fn().mockReturnValue({ id: roomId } as unknown as RoomData),
		};
		vi.mocked(Room).mockImplementation(
			() => mockRoomInstance as unknown as Room,
		);

		const manager = RoomManager.getInstance();

		const newState = {
			member: { id: "user-1", displayName: "テストユーザー" },
			channel: { parent: null, rawPosition: 5, parentId: null },
			guild: { id: "guild-1" },
		} as never;

		await manager.createRoom({} as never, newState);

		expect(mockRoomInstance.create).toHaveBeenCalledOnce();
		expect(mockStore.set).toHaveBeenCalledWith(roomId, expect.anything());
		expect(manager.get(roomId)).toBe(mockRoomInstance);
	});

	it("作成後にオーナーをルームのVCに移動する", async () => {
		const mockStore = createMockStore();
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockStore as unknown as RoomStore,
		);

		const roomId = "cat-002";
		const mockRoomInstance = {
			create: vi.fn().mockResolvedValue(roomId),
			moveMembers: vi.fn().mockResolvedValue(true),
			toData: vi.fn().mockReturnValue({ id: roomId } as unknown as RoomData),
		};
		vi.mocked(Room).mockImplementation(
			() => mockRoomInstance as unknown as Room,
		);

		const manager = RoomManager.getInstance();

		const newState = {
			member: { id: "user-2", displayName: "テストユーザー2" },
			channel: { parent: null, rawPosition: 3, parentId: null },
			guild: { id: "guild-1" },
		} as never;

		await manager.createRoom({} as never, newState);

		// moveMembers が newState を引数として呼ばれていること
		expect(mockRoomInstance.moveMembers).toHaveBeenCalledWith(newState);
	});

	it("Room.create()が失敗したとき、メモリ・ストアには何も保存されない", async () => {
		const mockStore = createMockStore();
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockStore as unknown as RoomStore,
		);

		const mockRoomInstance = {
			create: vi.fn().mockRejectedValue(new Error("チャンネル作成失敗")),
			moveMembers: vi.fn(),
			toData: vi.fn(),
		};
		vi.mocked(Room).mockImplementation(
			() => mockRoomInstance as unknown as Room,
		);

		const manager = RoomManager.getInstance();

		const newState = {
			member: { id: "user-3", displayName: "テストユーザー3" },
			channel: { parent: null, rawPosition: 1, parentId: null },
			guild: { id: "guild-1" },
		} as never;

		await manager.createRoom({} as never, newState);

		expect(mockStore.set).not.toHaveBeenCalled();
		expect(manager.getAll().size).toBe(0);
	});

	it("newState.memberがnullの場合は何も処理しない", async () => {
		const mockStore = createMockStore();
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockStore as unknown as RoomStore,
		);

		const mockRoomInstance = {
			create: vi.fn(),
			moveMembers: vi.fn(),
			toData: vi.fn(),
		};
		vi.mocked(Room).mockImplementation(
			() => mockRoomInstance as unknown as Room,
		);

		const manager = RoomManager.getInstance();

		const newState = {
			member: null,
			channel: { parent: null, rawPosition: 1, parentId: null },
			guild: { id: "guild-1" },
		} as never;

		await manager.createRoom({} as never, newState);

		expect(mockRoomInstance.create).not.toHaveBeenCalled();
	});
});

describe("RoomManager.handleMemberMove()", () => {
	beforeEach(() => {
		resetRoomManager();
		vi.clearAllMocks();
	});

	it("同じカテゴリ内での移動（例：VC1→VC2）は何も処理しない", async () => {
		const mockStore = createMockStore();
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockStore as unknown as RoomStore,
		);

		const manager = RoomManager.getInstance();

		// 同一カテゴリIDを持つ oldState と newState
		const oldState = {
			channel: { parentId: "cat-same" },
			member: { id: "user-1" },
		} as never;
		const newState = {
			channel: { parentId: "cat-same" },
			member: { id: "user-1" },
		} as never;

		const mockRoom = {
			setTextChannelVisibility: vi.fn(),
			delete: vi.fn(),
		};

		// ルームをメモリに登録
		getRooms(manager).set("cat-same", mockRoom as unknown as Room);

		await manager.handleMemberMove(oldState, newState);

		expect(mockRoom.setTextChannelVisibility).not.toHaveBeenCalled();
		expect(mockRoom.delete).not.toHaveBeenCalled();
	});

	it("新しいルームに入ったとき、そのルームのテキストチャンネルを閲覧可能にする", async () => {
		const mockStore = createMockStore();
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockStore as unknown as RoomStore,
		);

		const manager = RoomManager.getInstance();
		const member = { id: "user-1" };

		const oldState = {
			channel: null,
			member,
		} as never;
		const newState = {
			channel: { parentId: "cat-new" },
			member,
		} as never;

		const mockNewRoom = {
			setTextChannelVisibility: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn(),
		};

		getRooms(manager).set("cat-new", mockNewRoom as unknown as Room);

		await manager.handleMemberMove(oldState, newState);

		expect(mockNewRoom.setTextChannelVisibility).toHaveBeenCalledWith(
			member,
			true,
		);
	});

	it("古いルームから出たとき、ルームが空なら削除してストアからも除去する", async () => {
		const mockStore = createMockStore();
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockStore as unknown as RoomStore,
		);

		const manager = RoomManager.getInstance();
		const member = { id: "user-1" };

		const oldState = {
			channel: { parentId: "cat-old" },
			member,
		} as never;
		const newState = {
			channel: null,
			member,
		} as never;

		const mockOldRoom = {
			setTextChannelVisibility: vi.fn(),
			// delete() が true を返す → ルームは空で削除された
			delete: vi.fn().mockResolvedValue(true),
		};

		getRooms(manager).set("cat-old", mockOldRoom as unknown as Room);

		await manager.handleMemberMove(oldState, newState);

		expect(mockOldRoom.delete).toHaveBeenCalledOnce();
		expect(mockStore.delete).toHaveBeenCalledWith("cat-old");
		expect(getRooms(manager).has("cat-old")).toBe(false);
	});

	it("古いルームから出たが、まだメンバーがいる場合は削除しない", async () => {
		const mockStore = createMockStore();
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockStore as unknown as RoomStore,
		);

		const manager = RoomManager.getInstance();
		const member = { id: "user-1" };

		const oldState = {
			channel: { parentId: "cat-old" },
			member,
		} as never;
		const newState = {
			channel: null,
			member,
		} as never;

		const mockOldRoom = {
			setTextChannelVisibility: vi.fn(),
			// delete() が false を返す → まだメンバーがいるため削除されなかった
			delete: vi.fn().mockResolvedValue(false),
		};

		getRooms(manager).set("cat-old", mockOldRoom as unknown as Room);

		await manager.handleMemberMove(oldState, newState);

		expect(mockOldRoom.delete).toHaveBeenCalledOnce();
		expect(mockStore.delete).not.toHaveBeenCalled();
		expect(getRooms(manager).has("cat-old")).toBe(true);
	});
});

describe("RoomManager.recoverRooms()", () => {
	beforeEach(() => {
		resetRoomManager();
		vi.clearAllMocks();
	});

	it("ストアの全ルームデータを読み込み、それぞれRoom.fromData()で復元してメモリに登録する", async () => {
		const mockStore = createMockStore();

		const roomData1: RoomData = {
			id: "cat-r1",
			guildId: "guild-1",
			hostname: "ルーム1",
			ownerId: "user-1",
			gameId: "game-1",
			reserved: false,
			createdAt: new Date(),
			channels: {
				categoryId: "cat-r1",
				textChannelId: "text-r1",
				voiceChannelId: "vc-r1",
				additionalVoiceChannelIds: [],
			},
		};
		const roomData2: RoomData = {
			id: "cat-r2",
			guildId: "guild-1",
			hostname: "ルーム2",
			ownerId: "user-2",
			gameId: "game-1",
			reserved: false,
			createdAt: new Date(),
			channels: {
				categoryId: "cat-r2",
				textChannelId: "text-r2",
				voiceChannelId: "vc-r2",
				additionalVoiceChannelIds: [],
			},
		};

		mockStore.getAll.mockResolvedValue([roomData1, roomData2]);
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockStore as unknown as RoomStore,
		);

		const mockRoomInstance1 = {} as unknown as Room;
		const mockRoomInstance2 = {} as unknown as Room;

		// Room.fromData をモック（静的メソッド）
		const fromDataMock = vi
			.fn()
			.mockResolvedValueOnce(mockRoomInstance1)
			.mockResolvedValueOnce(mockRoomInstance2);
		vi.mocked(Room).fromData = fromDataMock;

		const guild = {
			id: "guild-1",
			channels: {
				cache: new Collection([
					["cat-r1", { id: "cat-r1" }],
					["cat-r2", { id: "cat-r2" }],
				]),
			},
			members: { cache: new Collection() },
		};
		const client = {
			guilds: {
				cache: new Collection([["guild-1", guild]]),
			},
		} as never;

		const manager = RoomManager.getInstance();
		await manager.recoverRooms(client);

		expect(fromDataMock).toHaveBeenCalledTimes(2);
		expect(manager.get("cat-r1")).toBe(mockRoomInstance1);
		expect(manager.get("cat-r2")).toBe(mockRoomInstance2);
	});

	it("一部のルームの復元に失敗しても、残りのルームは引き続き処理される", async () => {
		const mockStore = createMockStore();

		const roomDataOk: RoomData = {
			id: "cat-ok",
			guildId: "guild-1",
			hostname: "正常ルーム",
			ownerId: "user-1",
			gameId: "game-1",
			reserved: false,
			createdAt: new Date(),
			channels: {
				categoryId: "cat-ok",
				textChannelId: "text-ok",
				voiceChannelId: "vc-ok",
				additionalVoiceChannelIds: [],
			},
		};
		// ギルドが存在しないため復元失敗するルームデータ
		const roomDataFail: RoomData = {
			id: "cat-fail",
			guildId: "guild-missing",
			hostname: "失敗ルーム",
			ownerId: "user-2",
			gameId: "game-1",
			reserved: false,
			createdAt: new Date(),
			channels: {
				categoryId: "cat-fail",
				textChannelId: "text-fail",
				voiceChannelId: "vc-fail",
				additionalVoiceChannelIds: [],
			},
		};

		// 失敗データを先に並べてもOKなケースも引き続き処理されることを確認
		mockStore.getAll.mockResolvedValue([roomDataFail, roomDataOk]);
		vi.mocked(RoomStore.getInstance).mockReturnValue(
			mockStore as unknown as RoomStore,
		);

		const mockRoomInstanceOk = {} as unknown as Room;

		const fromDataMock = vi.fn().mockResolvedValue(mockRoomInstanceOk);
		vi.mocked(Room).fromData = fromDataMock;

		// guild-missing は存在しない、guild-1 だけ存在する
		const guildOk = {
			id: "guild-1",
			channels: {
				cache: new Collection([["cat-ok", { id: "cat-ok" }]]),
			},
			members: { cache: new Collection() },
		};
		const client = {
			guilds: {
				cache: new Collection([["guild-1", guildOk]]),
			},
		} as never;

		const manager = RoomManager.getInstance();
		await manager.recoverRooms(client);

		// 失敗したルームはストアから削除される
		expect(mockStore.delete).toHaveBeenCalledWith("cat-fail");

		// 成功したルームはメモリに登録される
		expect(manager.get("cat-ok")).toBe(mockRoomInstanceOk);

		// fromData は失敗ルームでは呼ばれず、成功ルームだけ呼ばれる
		expect(fromDataMock).toHaveBeenCalledTimes(1);
	});
});
