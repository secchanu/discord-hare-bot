import { ChannelType, Collection, PermissionFlagsBits } from "discord.js";
import type { Guild, GuildMember } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameManager } from "../games/GameManager";
import { defaultGame } from "../games/types";
import { Room } from "./Room";
import type { RoomData } from "./types";

vi.mock("../games/GameManager", () => ({
	GameManager: { getInstance: vi.fn() },
}));

vi.mock("../../bot/config", () => ({
	config: {
		readyChannelId: "ready-channel-id",
		wantedChannelId: "wanted-channel-id",
		ignoreRoleIds: ["ignore-role-id"],
	},
}));

// テキストチャンネルのモックを生成
function makeTextChannel(id: string) {
	return {
		id,
		type: ChannelType.GuildText,
		isVoiceBased: () => false,
		isTextBased: () => true,
		permissionOverwrites: {
			edit: vi.fn().mockResolvedValue(undefined),
			set: vi.fn().mockResolvedValue(undefined),
		},
		messages: {
			cache: new Collection(),
		},
		createMessageCollector: vi.fn().mockReturnValue({
			on: vi.fn(),
			stop: vi.fn(),
		}),
	};
}

// ボイスチャンネルのモックを生成
function makeVoiceChannel(id: string, members: Collection<string, GuildMember> = new Collection()) {
	return {
		id,
		name: "Free",
		type: ChannelType.GuildVoice,
		isVoiceBased: () => true,
		members,
		setName: vi.fn().mockResolvedValue(undefined),
	};
}

// カテゴリのモックを生成
function makeCategory(id: string) {
	return {
		id,
		type: ChannelType.GuildCategory,
		isVoiceBased: () => false,
	};
}

// GuildMemberのモックを生成
function makeMember(id: string, isBot = false) {
	return {
		id,
		user: { bot: isBot },
		roles: { resolve: vi.fn() },
		voice: { channelId: null, setChannel: vi.fn() },
	} as unknown as GuildMember;
}

const mockChannelManager = {
	create: vi.fn(),
	delete: vi.fn(),
	resolve: vi.fn(),
};

const mockGameManager = {
	getDefaultGame: vi.fn().mockReturnValue(defaultGame),
	getGame: vi.fn(),
	createGame: vi.fn(),
};

const mockGuild = {
	id: "guild-id",
	channels: mockChannelManager,
	members: { resolve: vi.fn() },
	roles: {
		everyone: { id: "everyone-id" },
		resolve: vi.fn(),
	},
	maximumBitrate: 96000,
} as unknown as Guild;

describe("Room", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(GameManager.getInstance).mockReturnValue(mockGameManager as unknown as GameManager);
		mockGameManager.getDefaultGame.mockReturnValue(defaultGame);

		// setupGameCollector 内で呼ばれる wantedChannel の解決をデフォルトで null にする
		// （テスト毎に必要に応じて上書きする）
		mockChannelManager.resolve.mockReturnValue(null);
	});

	// -----------------------------------------------------------------------
	// Room.create()
	// -----------------------------------------------------------------------
	describe("create()", () => {
		it("カテゴリ・テキストチャンネル・VCの3つが作成される", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id");

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			expect(mockChannelManager.create).toHaveBeenCalledTimes(3);
		});

		it("テキストチャンネルはparentにカテゴリが設定される", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id");

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			// テキストチャンネル作成時の引数
			const textChannelCallArgs = mockChannelManager.create.mock.calls[1][0];
			expect(textChannelCallArgs.parent).toBe(category);
			expect(textChannelCallArgs.type).toBe(ChannelType.GuildText);
		});

		it("VCはparentにカテゴリが設定される", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id");

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			// VC作成時の引数
			const vcCallArgs = mockChannelManager.create.mock.calls[2][0];
			expect(vcCallArgs.parent).toBe(category);
			expect(vcCallArgs.type).toBe(ChannelType.GuildVoice);
		});

		it("テキストチャンネルは @everyone の ViewChannel が deny で作成される", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id");

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			const textChannelCallArgs = mockChannelManager.create.mock.calls[1][0];
			expect(textChannelCallArgs.permissionOverwrites).toEqual([
				{ id: mockGuild.id, deny: ["ViewChannel"] },
			]);
		});

		it("オーナーが直近のwantedチャンネルのメッセージにロールをメンションしていた場合、そのゲームが初期ゲームとしてVC名に反映される", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id");
			const gameRole = { id: "game-role-id", name: "ApexLegends" };
			const game = { id: "game-role-id", name: "ApexLegends", data: {} };

			// メンバーのロール解決
			const owner = makeMember("owner-id");
			(owner.roles.resolve as ReturnType<typeof vi.fn>).mockReturnValue(gameRole);

			// wantedChannelの過去メッセージにロールメンションがある
			const recentTime = new Date(Date.now() - 1000); // 1秒前
			const mockMessage = {
				author: { id: "owner-id" },
				createdAt: recentTime,
				editedAt: null,
				mentions: {
					roles: new Collection([["game-role-id", gameRole]]),
					everyone: false,
				},
			};
			const messagesCache = new Collection([["msg-1", mockMessage]]);
			const wantedChannel = {
				...makeTextChannel("wanted-channel-id"),
				messages: { cache: messagesCache },
			};
			// wantedChannelId 解決（resolve は "wanted-channel-id" のとき wantedChannel を返す）
			(mockGuild.members.resolve as ReturnType<typeof vi.fn>).mockReturnValue(owner);
			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "wanted-channel-id") return wantedChannel;
				return null;
			});
			mockGameManager.getGame.mockResolvedValue(game);
			mockGameManager.getDefaultGame.mockReturnValue(defaultGame);

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom", ownerId: "owner-id" });
			await room.create();

			// VC名がゲーム名になっている
			const vcCallArgs = mockChannelManager.create.mock.calls[2][0];
			expect(vcCallArgs.name).toBe("ApexLegends");
		});

		it("gameCollectorがセットアップされる（wantedチャンネルのメッセージ監視が開始される）", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id");
			const createMessageCollector = vi.fn().mockReturnValue({ on: vi.fn(), stop: vi.fn() });
			const wantedChannel = {
				...makeTextChannel("wanted-channel-id"),
				createMessageCollector,
			};

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "wanted-channel-id") return wantedChannel;
				return null;
			});
			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			expect(createMessageCollector).toHaveBeenCalled();
		});

		it("作成されたカテゴリのIDが返り値になる", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id");

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			const result = await room.create();

			expect(result).toBe("category-id");
		});
	});

	// -----------------------------------------------------------------------
	// Room.toData()
	// -----------------------------------------------------------------------
	describe("toData()", () => {
		it("チャンネルが初期化済みのとき、全フィールドが正しく含まれたオブジェクトを返す", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id");

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, {
				hostname: "TestRoom",
				ownerId: "owner-id",
				reserved: false,
				eventId: "event-id",
			});
			await room.create();
			const data = room.toData();

			expect(data).toMatchObject({
				id: "category-id",
				guildId: "guild-id",
				hostname: "TestRoom",
				ownerId: "owner-id",
				gameId: defaultGame.id,
				reserved: false,
				eventId: "event-id",
				channels: {
					categoryId: "category-id",
					textChannelId: "text-id",
					voiceChannelId: "voice-id",
					additionalVoiceChannelIds: [],
				},
			});
			expect(data.createdAt).toBeInstanceOf(Date);
		});

		it("チャンネルが未初期化のときはエラーをスローする", () => {
			const room = new Room(mockGuild, { hostname: "TestRoom" });
			expect(() => room.toData()).toThrow("Room channels are not fully initialized");
		});
	});

	// -----------------------------------------------------------------------
	// Room.fromData()
	// -----------------------------------------------------------------------
	describe("fromData()", () => {
		const baseData: RoomData = {
			id: "category-id",
			guildId: "guild-id",
			hostname: "TestRoom",
			ownerId: "owner-id",
			gameId: "game-role-id",
			reserved: false,
			createdAt: new Date(),
			channels: {
				categoryId: "category-id",
				textChannelId: "text-id",
				voiceChannelId: "voice-id",
				additionalVoiceChannelIds: ["add-vc-1"],
			},
			eventId: "event-id",
		};

		it("保存データからRoomインスタンスが復元され、各チャンネルIDが正しくセットされる", async () => {
			mockGameManager.getGame.mockResolvedValue(null);

			const room = await Room.fromData(mockGuild, baseData);

			expect(room.id).toBe("category-id");
			// toData()でチャンネルIDが正しいことを確認
			const data = room.toData();
			expect(data.channels.categoryId).toBe("category-id");
			expect(data.channels.textChannelId).toBe("text-id");
			expect(data.channels.voiceChannelId).toBe("voice-id");
			expect(data.channels.additionalVoiceChannelIds).toEqual(["add-vc-1"]);
		});

		it("対応するゲームがストアに存在する場合、そのゲームが復元される", async () => {
			const game = { id: "game-role-id", name: "ApexLegends", data: {} };
			mockGameManager.getGame.mockResolvedValue(game);

			const room = await Room.fromData(mockGuild, baseData);
			const data = room.toData();

			expect(data.gameId).toBe("game-role-id");
		});

		it("対応するゲームがストアに存在しない場合はデフォルトゲームが使われる", async () => {
			mockGameManager.getGame.mockResolvedValue(null);

			const room = await Room.fromData(mockGuild, baseData);
			const data = room.toData();

			expect(data.gameId).toBe(defaultGame.id);
		});
	});

	// -----------------------------------------------------------------------
	// Room.members（ゲッター）
	// -----------------------------------------------------------------------
	describe("members（ゲッター）", () => {
		it("メインVCと追加VC両方のメンバーが合算して返される", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const member1 = makeMember("member-1");
			const member2 = makeMember("member-2");
			const mainVcMembers = new Collection<string, GuildMember>([["member-1", member1]]);
			const addVcMembers = new Collection<string, GuildMember>([["member-2", member2]]);
			const voiceChannel = makeVoiceChannel("voice-id", mainVcMembers);
			const addVoiceChannel = makeVoiceChannel("add-vc-1", addVcMembers);

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel)
				.mockResolvedValueOnce(addVoiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();
			await room.setAdditionalVoiceChannels(1);

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				if (id === "add-vc-1") return addVoiceChannel;
				if (id === "wanted-channel-id") return null;
				return null;
			});

			const members = room.members;
			expect(members.size).toBe(2);
			expect(members.has("member-1")).toBe(true);
			expect(members.has("member-2")).toBe(true);
		});

		it("Botユーザーは除外される", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const humanMember = makeMember("human-1", false);
			const botMember = makeMember("bot-1", true);
			const vcMembers = new Collection<string, GuildMember>([
				["human-1", humanMember],
				["bot-1", botMember],
			]);
			const voiceChannel = makeVoiceChannel("voice-id", vcMembers);

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				return null;
			});

			const members = room.members;
			expect(members.size).toBe(1);
			expect(members.has("human-1")).toBe(true);
			expect(members.has("bot-1")).toBe(false);
		});

		it("VCにメンバーがいない場合は空のCollectionを返す", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id", new Collection());

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				return null;
			});

			const members = room.members;
			expect(members.size).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// Room.delete()
	// -----------------------------------------------------------------------
	describe("delete()", () => {
		it("reserved === true のときは削除せず false を返す", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id", new Collection());

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom", reserved: true });
			await room.create();

			const result = await room.delete();

			expect(result).toBe(false);
			expect(mockChannelManager.delete).not.toHaveBeenCalled();
		});

		it("VCにメンバーがいるときは削除せず false を返す", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const member = makeMember("member-1");
			const voiceChannel = makeVoiceChannel("voice-id", new Collection([["member-1", member]]));

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				return null;
			});

			const result = await room.delete();

			expect(result).toBe(false);
			expect(mockChannelManager.delete).not.toHaveBeenCalled();
		});

		it("条件を満たせば追加VCを含む全チャンネルを削除して true を返す", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id", new Collection());
			const addVoiceChannel = makeVoiceChannel("add-vc-1", new Collection());

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel)
				.mockResolvedValueOnce(addVoiceChannel);
			mockChannelManager.delete.mockResolvedValue(undefined);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();
			await room.setAdditionalVoiceChannels(1);

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				if (id === "add-vc-1") return addVoiceChannel;
				return null;
			});

			const result = await room.delete();

			expect(result).toBe(true);
			// 追加VC・メインVC・テキストチャンネル・カテゴリが削除される
			expect(mockChannelManager.delete).toHaveBeenCalledWith("add-vc-1");
			expect(mockChannelManager.delete).toHaveBeenCalledWith("voice-id");
			expect(mockChannelManager.delete).toHaveBeenCalledWith("text-id");
			expect(mockChannelManager.delete).toHaveBeenCalledWith("category-id");
		});
	});

	// -----------------------------------------------------------------------
	// Room.setGame()
	// -----------------------------------------------------------------------
	describe("setGame()", () => {
		async function createRoomWithGame() {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id", new Collection());

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				return null;
			});

			return { room, voiceChannel };
		}

		it("同じゲームIDを渡したときは何もせず現在のゲームを返す", async () => {
			const { room } = await createRoomWithGame();

			// デフォルトゲームのID（空文字）を渡す
			const result = await room.setGame(defaultGame.id);

			expect(result).toEqual(defaultGame);
			expect(mockGameManager.getGame).not.toHaveBeenCalled();
		});

		it("@everyone のIDを渡したときはデフォルトゲームに切り替わる", async () => {
			// まず別のゲームに切り替えておく
			const anotherGame = { id: "game-role-id", name: "ApexLegends", data: {} };
			mockGameManager.getGame.mockResolvedValue(anotherGame);
			(mockGuild.roles.resolve as ReturnType<typeof vi.fn>).mockReturnValue(null);

			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id", new Collection());

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				return null;
			});

			// 別ゲームに切り替え
			await room.setGame("game-role-id");

			// @everyone のIDでデフォルトゲームに戻す
			vi.clearAllMocks();
			vi.mocked(GameManager.getInstance).mockReturnValue(mockGameManager as unknown as GameManager);
			mockGameManager.getDefaultGame.mockReturnValue(defaultGame);
			mockGameManager.getGame.mockResolvedValue(defaultGame);
			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				return null;
			});

			const result = await room.setGame("everyone-id");

			expect(result).toEqual(defaultGame);
		});

		it("存在するゲームIDを渡したときはそのゲームに切り替わり、VC名が更新される", async () => {
			const { room, voiceChannel } = await createRoomWithGame();
			const game = { id: "apex-role-id", name: "ApexLegends", data: {} };
			mockGameManager.getGame.mockResolvedValue(game);

			const result = await room.setGame("apex-role-id");

			expect(result).toEqual(game);
			expect(voiceChannel.setName).toHaveBeenCalledWith("ApexLegends");
		});

		it("ゲームが未登録のロールIDの場合は新規作成される", async () => {
			const { room } = await createRoomWithGame();
			const role = { id: "new-role-id", name: "NewGame" };
			const newGame = { id: "new-role-id", name: "NewGame", data: {} };

			mockGameManager.getGame.mockResolvedValue(null);
			(mockGuild.roles.resolve as ReturnType<typeof vi.fn>).mockReturnValue(role);
			mockGameManager.createGame.mockResolvedValue(newGame);

			const result = await room.setGame("new-role-id");

			expect(mockGameManager.createGame).toHaveBeenCalledWith(role);
			expect(result).toEqual(newGame);
		});

		it("ignoreRoleIds に含まれるロールIDの場合は null を返す", async () => {
			const { room } = await createRoomWithGame();
			const role = { id: "ignore-role-id", name: "IgnoredGame" };

			mockGameManager.getGame.mockResolvedValue(null);
			(mockGuild.roles.resolve as ReturnType<typeof vi.fn>).mockReturnValue(role);

			const result = await room.setGame("ignore-role-id");

			expect(result).toBeNull();
			expect(mockGameManager.createGame).not.toHaveBeenCalled();
		});

		it("存在しないロールIDの場合は null を返す", async () => {
			const { room } = await createRoomWithGame();

			mockGameManager.getGame.mockResolvedValue(null);
			(mockGuild.roles.resolve as ReturnType<typeof vi.fn>).mockReturnValue(null);

			const result = await room.setGame("nonexistent-role-id");

			expect(result).toBeNull();
			expect(mockGameManager.createGame).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// Room.setAdditionalVoiceChannels()
	// -----------------------------------------------------------------------
	describe("setAdditionalVoiceChannels()", () => {
		async function createRoom() {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id", new Collection());

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			// 追加VC作成のモック
			mockChannelManager.create.mockImplementation(async () =>
				makeVoiceChannel(`add-vc-${Date.now()}-${Math.random()}`, new Collection()),
			);

			return room;
		}

		it("現在より多い数を指定したとき、差分のVCが追加される（名前は VC [1], VC [2] ...）", async () => {
			const room = await createRoom();
			mockChannelManager.create.mockReset();

			const addVc1 = makeVoiceChannel("add-vc-1");
			const addVc2 = makeVoiceChannel("add-vc-2");
			mockChannelManager.create.mockResolvedValueOnce(addVc1).mockResolvedValueOnce(addVc2);

			const result = await room.setAdditionalVoiceChannels(2);

			expect(result).toBe(2);
			expect(mockChannelManager.create).toHaveBeenCalledTimes(2);
			expect(mockChannelManager.create).toHaveBeenCalledWith(
				expect.objectContaining({ name: "VC [1]", type: ChannelType.GuildVoice }),
			);
			expect(mockChannelManager.create).toHaveBeenCalledWith(
				expect.objectContaining({ name: "VC [2]", type: ChannelType.GuildVoice }),
			);
		});

		it("現在より少ない数を指定したとき、末尾から差分のVCが削除される", async () => {
			const room = await createRoom();
			mockChannelManager.create.mockReset();

			// まず2つ追加
			const addVc1 = makeVoiceChannel("add-vc-1");
			const addVc2 = makeVoiceChannel("add-vc-2");
			mockChannelManager.create.mockResolvedValueOnce(addVc1).mockResolvedValueOnce(addVc2);
			await room.setAdditionalVoiceChannels(2);

			mockChannelManager.delete.mockResolvedValue(undefined);

			// 1つに減らす（末尾の add-vc-2 が削除される）
			const result = await room.setAdditionalVoiceChannels(1);

			expect(result).toBe(1);
			expect(mockChannelManager.delete).toHaveBeenCalledWith("add-vc-2");
			expect(mockChannelManager.delete).not.toHaveBeenCalledWith("add-vc-1");
		});

		it("0 を指定したとき、全追加VCが削除される", async () => {
			const room = await createRoom();
			mockChannelManager.create.mockReset();

			const addVc1 = makeVoiceChannel("add-vc-1");
			const addVc2 = makeVoiceChannel("add-vc-2");
			mockChannelManager.create.mockResolvedValueOnce(addVc1).mockResolvedValueOnce(addVc2);
			await room.setAdditionalVoiceChannels(2);

			mockChannelManager.delete.mockResolvedValue(undefined);

			const result = await room.setAdditionalVoiceChannels(0);

			expect(result).toBe(0);
			expect(mockChannelManager.delete).toHaveBeenCalledWith("add-vc-1");
			expect(mockChannelManager.delete).toHaveBeenCalledWith("add-vc-2");
		});

		it("現在と同じ数を指定したとき、何も変化しない", async () => {
			const room = await createRoom();
			mockChannelManager.create.mockReset();

			const addVc1 = makeVoiceChannel("add-vc-1");
			mockChannelManager.create.mockResolvedValueOnce(addVc1);
			await room.setAdditionalVoiceChannels(1);

			mockChannelManager.create.mockReset();
			mockChannelManager.delete.mockReset();

			// 同じ数を指定
			const result = await room.setAdditionalVoiceChannels(1);

			expect(result).toBe(1);
			expect(mockChannelManager.create).not.toHaveBeenCalled();
			expect(mockChannelManager.delete).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// Room.setTextChannelVisibility()
	// -----------------------------------------------------------------------
	describe("setTextChannelVisibility()", () => {
		async function createRoomWithTextChannel() {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id", new Collection());

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "text-id") return textChannel;
				if (id === "voice-id") return voiceChannel;
				return null;
			});

			return { room, textChannel };
		}

		it("visible: true のとき ViewChannel: true で権限を編集する", async () => {
			const { room, textChannel } = await createRoomWithTextChannel();
			const member = makeMember("member-1");

			await room.setTextChannelVisibility(member, true);

			expect(textChannel.permissionOverwrites.edit).toHaveBeenCalledWith(member, {
				ViewChannel: true,
			});
		});

		it("visible: false のとき ViewChannel: null で権限を編集する（剥奪ではなく継承に戻す）", async () => {
			const { room, textChannel } = await createRoomWithTextChannel();
			const member = makeMember("member-1");

			await room.setTextChannelVisibility(member, false);

			expect(textChannel.permissionOverwrites.edit).toHaveBeenCalledWith(member, {
				ViewChannel: null,
			});
		});
	});

	// -----------------------------------------------------------------------
	// Room.syncTextChannelPermissions()
	// -----------------------------------------------------------------------
	describe("syncTextChannelPermissions()", () => {
		it("現在のVC在室メンバー全員に ViewChannel: allow を設定し、@everyone を deny にする", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const member1 = makeMember("member-1");
			const member2 = makeMember("member-2");
			const vcMembers = new Collection<string, GuildMember>([
				["member-1", member1],
				["member-2", member2],
			]);
			const voiceChannel = makeVoiceChannel("voice-id", vcMembers);

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "text-id") return textChannel;
				if (id === "voice-id") return voiceChannel;
				return null;
			});

			await room.syncTextChannelPermissions();

			expect(textChannel.permissionOverwrites.set).toHaveBeenCalledWith([
				{ id: mockGuild.id, deny: [PermissionFlagsBits.ViewChannel] },
				{ id: "member-1", allow: [PermissionFlagsBits.ViewChannel] },
				{ id: "member-2", allow: [PermissionFlagsBits.ViewChannel] },
			]);
		});
	});

	// -----------------------------------------------------------------------
	// Room.moveMembers()
	// -----------------------------------------------------------------------
	describe("moveMembers()", () => {
		async function createRoom() {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id", new Collection());

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				return null;
			});

			return room;
		}

		it("指定インデックスのVCに voiceState.setChannel() を呼ぶ", async () => {
			const room = await createRoom();
			const setChannel = vi.fn().mockResolvedValue(undefined);
			const voiceState = {
				channelId: "other-vc-id",
				setChannel,
			} as unknown as import("discord.js").VoiceState;

			const result = await room.moveMembers(voiceState, 0);

			expect(setChannel).toHaveBeenCalledWith("voice-id");
			expect(result).toBe(true);
		});

		it("すでに対象VCにいる場合は setChannel() を呼ばず true を返す", async () => {
			const room = await createRoom();
			const setChannel = vi.fn();
			const voiceState = {
				channelId: "voice-id",
				setChannel,
			} as unknown as import("discord.js").VoiceState;

			const result = await room.moveMembers(voiceState, 0);

			expect(setChannel).not.toHaveBeenCalled();
			expect(result).toBe(true);
		});

		it("指定インデックスのVCが存在しない場合は false を返す", async () => {
			const room = await createRoom();
			const setChannel = vi.fn();
			const voiceState = {
				channelId: "other-vc-id",
				setChannel,
			} as unknown as import("discord.js").VoiceState;

			// インデックス 5 は存在しない
			const result = await room.moveMembers(voiceState, 5);

			expect(setChannel).not.toHaveBeenCalled();
			expect(result).toBe(false);
		});

		it("setChannel() が失敗した場合は false を返す", async () => {
			const room = await createRoom();
			const setChannel = vi.fn().mockRejectedValue(new Error("Permission denied"));
			const voiceState = {
				channelId: "other-vc-id",
				setChannel,
			} as unknown as import("discord.js").VoiceState;

			const result = await room.moveMembers(voiceState, 0);

			expect(result).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Room.callMembers()
	// -----------------------------------------------------------------------
	describe("callMembers()", () => {
		it("全メンバー分 moveMembers() が呼ばれ、全員の処理が完了してから関数が返る", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");

			const setChannel1 = vi.fn().mockResolvedValue(undefined);
			const setChannel2 = vi.fn().mockResolvedValue(undefined);
			const member1 = {
				...makeMember("member-1"),
				voice: { channelId: "other-vc", setChannel: setChannel1 },
			} as unknown as GuildMember;
			const member2 = {
				...makeMember("member-2"),
				voice: { channelId: "other-vc", setChannel: setChannel2 },
			} as unknown as GuildMember;

			const vcMembers = new Collection<string, GuildMember>([
				["member-1", member1],
				["member-2", member2],
			]);
			const voiceChannel = makeVoiceChannel("voice-id", vcMembers);

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" });
			await room.create();

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				return null;
			});

			await room.callMembers(0);

			expect(setChannel1).toHaveBeenCalledWith("voice-id");
			expect(setChannel2).toHaveBeenCalledWith("voice-id");
		});
	});
});
