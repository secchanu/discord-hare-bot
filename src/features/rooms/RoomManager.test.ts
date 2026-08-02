import { Collection } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotConfig } from "../../bot/config";
import type { GameManager } from "../games/GameManager";
import { defaultGame } from "../games/types";
import { Room } from "./Room";
import { RoomManager } from "./RoomManager";
import type { RoomStore } from "./RoomStore";
import type { RoomData } from "./types";

vi.mock("./Room", () => ({
	Room: vi.fn(),
}));

// プライベートプロパティへのテスト用アクセスヘルパー
function getRooms(manager: RoomManager): Collection<string, Room> {
	return (manager as unknown as { rooms: Collection<string, Room> }).rooms;
}

const mockStore = {
	set: vi.fn().mockResolvedValue(undefined),
	get: vi.fn(),
	delete: vi.fn().mockResolvedValue(undefined),
	getAll: vi.fn().mockResolvedValue([]),
};

const mockGameManager = {
	getDefaultGame: vi.fn().mockReturnValue(defaultGame),
	getGame: vi.fn(),
	createGame: vi.fn(),
};

const testConfig: BotConfig = {
	botToken: "token",
	guildId: "guild-1",
	readyChannelId: "ready-channel-id",
	wantedChannelId: "wanted-channel-id",
	ignoreRoleIds: ["ignore-role-id"],
	ignoreRoles: [{ id: "ignore-role-id", note: "" }],
};

function createManager(): RoomManager {
	return new RoomManager(
		mockStore as unknown as RoomStore,
		mockGameManager as unknown as GameManager,
		testConfig,
	);
}

// createRoom 用の VoiceState モック
function makeNewState(memberId: string | null) {
	return {
		member: memberId ? { id: memberId, displayName: `ユーザー${memberId}` } : null,
		channel: { parent: null, rawPosition: 5, parentId: null },
		guild: {
			id: "guild-1",
			channels: { resolve: vi.fn().mockReturnValue(null) },
			roles: { everyone: { id: "everyone-id" }, resolve: vi.fn() },
		},
	} as never;
}

describe("RoomManager.createRoom()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGameManager.getDefaultGame.mockReturnValue(defaultGame);
		mockStore.set.mockResolvedValue(undefined);
		mockStore.delete.mockResolvedValue(undefined);
	});

	it("Room.create()を呼び、返ったIDでメモリに登録する", async () => {
		const roomId = "cat-001";
		const mockRoomInstance = {
			create: vi.fn().mockResolvedValue(roomId),
			moveMembers: vi.fn().mockResolvedValue(true),
		};
		vi.mocked(Room).mockImplementation(function () {
			return mockRoomInstance;
		} as never);

		const manager = createManager();
		await manager.createRoom(makeNewState("user-1"));

		expect(mockRoomInstance.create).toHaveBeenCalledOnce();
		expect(manager.get(roomId)).toBe(mockRoomInstance);
	});

	it("作成後にオーナーをルームのVCに移動する", async () => {
		const mockRoomInstance = {
			create: vi.fn().mockResolvedValue("cat-002"),
			moveMembers: vi.fn().mockResolvedValue(true),
		};
		vi.mocked(Room).mockImplementation(function () {
			return mockRoomInstance;
		} as never);

		const manager = createManager();
		const newState = makeNewState("user-2");
		await manager.createRoom(newState);

		expect(mockRoomInstance.moveMembers).toHaveBeenCalledWith(newState);
	});

	it("Room.create()が失敗したとき、メモリには何も登録されない", async () => {
		const mockRoomInstance = {
			create: vi.fn().mockRejectedValue(new Error("チャンネル作成失敗")),
			moveMembers: vi.fn(),
		};
		vi.mocked(Room).mockImplementation(function () {
			return mockRoomInstance;
		} as never);

		const manager = createManager();
		await manager.createRoom(makeNewState("user-3"));

		expect(manager.getAll().size).toBe(0);
	});

	it("newState.memberがnullの場合は何も処理しない", async () => {
		const mockRoomInstance = {
			create: vi.fn(),
			moveMembers: vi.fn(),
		};
		vi.mocked(Room).mockImplementation(function () {
			return mockRoomInstance;
		} as never);

		const manager = createManager();
		await manager.createRoom(makeNewState(null));

		expect(mockRoomInstance.create).not.toHaveBeenCalled();
	});
});

describe("RoomManager.changeGame()", () => {
	const mockGuild = {
		id: "guild-1",
		roles: {
			everyone: { id: "everyone-id" },
			resolve: vi.fn(),
		},
	};

	function makeRoom(currentGameId: string) {
		return {
			guild: mockGuild,
			game: { id: currentGameId, name: "現在のゲーム", data: {} },
			setGame: vi.fn().mockResolvedValue(undefined),
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockGameManager.getDefaultGame.mockReturnValue(defaultGame);
	});

	it("@everyone のIDを渡したときはデフォルトゲームに切り替わる", async () => {
		const room = makeRoom("some-game-id");
		mockGameManager.getGame.mockResolvedValue(defaultGame);

		const manager = createManager();
		const result = await manager.changeGame(room as never, "everyone-id");

		expect(result).toEqual(defaultGame);
		expect(room.setGame).toHaveBeenCalledWith(defaultGame);
	});

	it("同じゲームIDを渡したときは何もせず現在のゲームを返す", async () => {
		const room = makeRoom("same-game-id");

		const manager = createManager();
		const result = await manager.changeGame(room as never, "same-game-id");

		expect(result).toEqual(room.game);
		expect(room.setGame).not.toHaveBeenCalled();
		expect(mockGameManager.getGame).not.toHaveBeenCalled();
	});

	it("存在するゲームIDを渡したときはそのゲームに切り替わる", async () => {
		const room = makeRoom(defaultGame.id);
		const game = { id: "apex-role-id", name: "ApexLegends", data: {} };
		mockGameManager.getGame.mockResolvedValue(game);

		const manager = createManager();
		const result = await manager.changeGame(room as never, "apex-role-id");

		expect(result).toEqual(game);
		expect(room.setGame).toHaveBeenCalledWith(game);
	});

	it("ゲームが未登録のロールIDの場合は新規作成される", async () => {
		const room = makeRoom(defaultGame.id);
		const role = { id: "new-role-id", name: "NewGame" };
		const newGame = { id: "new-role-id", name: "NewGame", data: {} };

		mockGameManager.getGame.mockResolvedValue(null);
		mockGuild.roles.resolve.mockReturnValue(role);
		mockGameManager.createGame.mockResolvedValue(newGame);

		const manager = createManager();
		const result = await manager.changeGame(room as never, "new-role-id");

		expect(mockGameManager.createGame).toHaveBeenCalledWith(role);
		expect(result).toEqual(newGame);
		expect(room.setGame).toHaveBeenCalledWith(newGame);
	});

	it("ignoreRoleIds に含まれるロールIDの場合は null を返す", async () => {
		const room = makeRoom(defaultGame.id);
		const role = { id: "ignore-role-id", name: "IgnoredGame" };

		mockGameManager.getGame.mockResolvedValue(null);
		mockGuild.roles.resolve.mockReturnValue(role);

		const manager = createManager();
		const result = await manager.changeGame(room as never, "ignore-role-id");

		expect(result).toBeNull();
		expect(room.setGame).not.toHaveBeenCalled();
		expect(mockGameManager.createGame).not.toHaveBeenCalled();
	});

	it("存在しないロールIDの場合は null を返す", async () => {
		const room = makeRoom(defaultGame.id);

		mockGameManager.getGame.mockResolvedValue(null);
		mockGuild.roles.resolve.mockReturnValue(null);

		const manager = createManager();
		const result = await manager.changeGame(room as never, "nonexistent-role-id");

		expect(result).toBeNull();
		expect(room.setGame).not.toHaveBeenCalled();
	});
});

describe("RoomManager.handleMemberMove()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockStore.delete.mockResolvedValue(undefined);
	});

	it("同じカテゴリ内での移動（例：VC1→VC2）は何も処理しない", async () => {
		const manager = createManager();

		const oldState = {
			channel: { parentId: "cat-same" },
			member: { id: "user-1" },
		} as never;
		const newState = {
			channel: { parentId: "cat-same" },
			member: { id: "user-1" },
		} as never;

		const mockRoom = {
			id: "cat-same",
			setTextChannelVisibility: vi.fn(),
			delete: vi.fn(),
		};

		getRooms(manager).set("cat-same", mockRoom as unknown as Room);

		await manager.handleMemberMove(oldState, newState);

		expect(mockRoom.setTextChannelVisibility).not.toHaveBeenCalled();
		expect(mockRoom.delete).not.toHaveBeenCalled();
	});

	it("新しいルームに入ったとき、そのルームのテキストチャンネルを閲覧可能にする", async () => {
		const manager = createManager();
		const member = { id: "user-1" };

		const oldState = { channel: null, member } as never;
		const newState = { channel: { parentId: "cat-new" }, member } as never;

		const mockNewRoom = {
			id: "cat-new",
			setTextChannelVisibility: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn(),
		};

		getRooms(manager).set("cat-new", mockNewRoom as unknown as Room);

		await manager.handleMemberMove(oldState, newState);

		expect(mockNewRoom.setTextChannelVisibility).toHaveBeenCalledWith(member, true);
	});

	it("古いルームから出たとき、ルームが空なら削除してストアからも除去する", async () => {
		const manager = createManager();
		const member = { id: "user-1" };

		const oldState = { channel: { parentId: "cat-old" }, member } as never;
		const newState = { channel: null, member } as never;

		const mockOldRoom = {
			id: "cat-old",
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
		const manager = createManager();
		const member = { id: "user-1" };

		const oldState = { channel: { parentId: "cat-old" }, member } as never;
		const newState = { channel: null, member } as never;

		const mockOldRoom = {
			id: "cat-old",
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

describe("RoomManager.findByEventId() / findByMemberId()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("eventIdからルームを検索できる", () => {
		const manager = createManager();
		const eventRoom = { id: "cat-1", eventId: "event-1", members: new Collection() };
		const normalRoom = { id: "cat-2", eventId: undefined, members: new Collection() };

		getRooms(manager).set("cat-1", eventRoom as unknown as Room);
		getRooms(manager).set("cat-2", normalRoom as unknown as Room);

		expect(manager.findByEventId("event-1")).toBe(eventRoom);
		expect(manager.findByEventId("event-unknown")).toBeUndefined();
	});

	it("メンバーが参加しているルームを検索できる", () => {
		const manager = createManager();
		const member = { id: "user-1" };
		const roomWithMember = {
			id: "cat-1",
			members: new Collection([["user-1", member]]),
		};
		const emptyRoom = { id: "cat-2", members: new Collection() };

		getRooms(manager).set("cat-1", roomWithMember as unknown as Room);
		getRooms(manager).set("cat-2", emptyRoom as unknown as Room);

		expect(manager.findByMemberId("user-1")).toBe(roomWithMember);
		expect(manager.findByMemberId("user-unknown")).toBeUndefined();
	});
});

describe("RoomManager.recoverRooms()", () => {
	const guild = {
		id: "guild-1",
		channels: {
			cache: new Collection([
				["cat-r1", { id: "cat-r1" }],
				["cat-r2", { id: "cat-r2" }],
				["cat-ok", { id: "cat-ok" }],
			]),
		},
	} as never;

	function makeRoomData(id: string, guildId = "guild-1"): RoomData {
		return {
			id,
			guildId,
			hostname: `ルーム${id}`,
			ownerId: "user-1",
			gameId: "game-1",
			reserved: false,
			createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
			channels: {
				categoryId: id,
				textChannelId: `text-${id}`,
				voiceChannelId: `vc-${id}`,
				additionalVoiceChannelIds: [],
			},
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockGameManager.getDefaultGame.mockReturnValue(defaultGame);
		mockStore.delete.mockResolvedValue(undefined);
	});

	it("ストアの全ルームデータを読み込み、それぞれRoom.fromData()で復元してメモリに登録する", async () => {
		mockStore.getAll.mockResolvedValue([makeRoomData("cat-r1"), makeRoomData("cat-r2")]);
		mockGameManager.getGame.mockResolvedValue(null);

		const mockRoomInstance1 = {} as unknown as Room;
		const mockRoomInstance2 = {} as unknown as Room;
		const fromDataMock = vi
			.fn()
			.mockReturnValueOnce(mockRoomInstance1)
			.mockReturnValueOnce(mockRoomInstance2);
		vi.mocked(Room).fromData = fromDataMock;

		const manager = createManager();
		await manager.recoverRooms(guild);

		expect(fromDataMock).toHaveBeenCalledTimes(2);
		expect(manager.get("cat-r1")).toBe(mockRoomInstance1);
		expect(manager.get("cat-r2")).toBe(mockRoomInstance2);
	});

	it("一部のルームの復元に失敗しても、残りのルームは引き続き処理される", async () => {
		// cat-missing はカテゴリが存在しないため復元に失敗する
		mockStore.getAll.mockResolvedValue([makeRoomData("cat-missing"), makeRoomData("cat-ok")]);
		mockGameManager.getGame.mockResolvedValue(null);

		const mockRoomInstanceOk = {} as unknown as Room;
		const fromDataMock = vi.fn().mockReturnValue(mockRoomInstanceOk);
		vi.mocked(Room).fromData = fromDataMock;

		const manager = createManager();
		await manager.recoverRooms(guild);

		// 失敗したルームはストアから削除される
		expect(mockStore.delete).toHaveBeenCalledWith("cat-missing");
		// 成功したルームはメモリに登録される
		expect(manager.get("cat-ok")).toBe(mockRoomInstanceOk);
		expect(fromDataMock).toHaveBeenCalledTimes(1);
	});

	it("別ギルドのルームデータは復元せずストアから削除する", async () => {
		mockStore.getAll.mockResolvedValue([makeRoomData("cat-other", "other-guild")]);

		const fromDataMock = vi.fn();
		vi.mocked(Room).fromData = fromDataMock;

		const manager = createManager();
		await manager.recoverRooms(guild);

		expect(fromDataMock).not.toHaveBeenCalled();
		expect(mockStore.delete).toHaveBeenCalledWith("cat-other");
	});
});

describe("RoomManager.reconcile()", () => {
	function makeGuildWithEvents(events: Map<string, { completed: boolean; canceled: boolean }>) {
		return {
			id: "guild-1",
			scheduledEvents: {
				fetch: vi.fn(async (eventId: string) => {
					const event = events.get(eventId);
					if (!event) throw new Error("Unknown event");
					return {
						isCompleted: () => event.completed,
						isCanceled: () => event.canceled,
					};
				}),
			},
		} as never;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockStore.delete.mockResolvedValue(undefined);
	});

	it("空の通常ルームは削除される（Bot停止中の退出の回収）", async () => {
		const manager = createManager();
		const emptyRoom = {
			id: "cat-empty",
			reserved: false,
			eventId: undefined,
			delete: vi.fn().mockResolvedValue(true),
		};
		getRooms(manager).set("cat-empty", emptyRoom as unknown as Room);

		await manager.reconcile(makeGuildWithEvents(new Map()));

		expect(emptyRoom.delete).toHaveBeenCalled();
		expect(getRooms(manager).has("cat-empty")).toBe(false);
		expect(mockStore.delete).toHaveBeenCalledWith("cat-empty");
	});

	it("メンバーがいるルームは維持される", async () => {
		const manager = createManager();
		const occupiedRoom = {
			id: "cat-occupied",
			reserved: false,
			eventId: undefined,
			// メンバーがいるため delete は false を返す
			delete: vi.fn().mockResolvedValue(false),
		};
		getRooms(manager).set("cat-occupied", occupiedRoom as unknown as Room);

		await manager.reconcile(makeGuildWithEvents(new Map()));

		expect(getRooms(manager).has("cat-occupied")).toBe(true);
		expect(mockStore.delete).not.toHaveBeenCalled();
	});

	it("有効なイベントに紐づく予約ルームは維持される", async () => {
		const manager = createManager();
		const reservedRoom = {
			id: "cat-event",
			reserved: true,
			eventId: "event-1",
			unreserve: vi.fn(),
			// 予約中のため delete は false を返す
			delete: vi.fn().mockResolvedValue(false),
		};
		getRooms(manager).set("cat-event", reservedRoom as unknown as Room);

		const guild = makeGuildWithEvents(
			new Map([["event-1", { completed: false, canceled: false }]]),
		);
		await manager.reconcile(guild);

		expect(reservedRoom.unreserve).not.toHaveBeenCalled();
		expect(getRooms(manager).has("cat-event")).toBe(true);
	});

	it("イベントが消えている予約ルームは予約解除して回収する", async () => {
		const manager = createManager();
		const orphanedRoom = {
			id: "cat-orphan",
			reserved: true,
			eventId: "event-deleted",
			unreserve: vi.fn(),
			delete: vi.fn().mockResolvedValue(true),
		};
		getRooms(manager).set("cat-orphan", orphanedRoom as unknown as Room);

		await manager.reconcile(makeGuildWithEvents(new Map()));

		expect(orphanedRoom.unreserve).toHaveBeenCalled();
		expect(orphanedRoom.delete).toHaveBeenCalled();
		expect(getRooms(manager).has("cat-orphan")).toBe(false);
	});

	it("イベントが終了している予約ルームは予約解除して回収する", async () => {
		const manager = createManager();
		const completedRoom = {
			id: "cat-completed",
			reserved: true,
			eventId: "event-done",
			unreserve: vi.fn(),
			delete: vi.fn().mockResolvedValue(true),
		};
		getRooms(manager).set("cat-completed", completedRoom as unknown as Room);

		const guild = makeGuildWithEvents(
			new Map([["event-done", { completed: true, canceled: false }]]),
		);
		await manager.reconcile(guild);

		expect(completedRoom.unreserve).toHaveBeenCalled();
		expect(getRooms(manager).has("cat-completed")).toBe(false);
	});

	it("1つのルームの処理が失敗しても残りのルームは処理される", async () => {
		const manager = createManager();
		const failingRoom = {
			id: "cat-fail",
			reserved: false,
			eventId: undefined,
			delete: vi.fn().mockRejectedValue(new Error("削除失敗")),
		};
		const emptyRoom = {
			id: "cat-empty",
			reserved: false,
			eventId: undefined,
			delete: vi.fn().mockResolvedValue(true),
		};
		getRooms(manager).set("cat-fail", failingRoom as unknown as Room);
		getRooms(manager).set("cat-empty", emptyRoom as unknown as Room);

		await manager.reconcile(makeGuildWithEvents(new Map()));

		// 失敗したルームはメモリに残る（次回起動時に再試行される）
		expect(getRooms(manager).has("cat-fail")).toBe(true);
		// 残りのルームは正常に回収される
		expect(getRooms(manager).has("cat-empty")).toBe(false);
	});
});
