import { ChannelType, Collection, PermissionFlagsBits } from "discord.js";
import type { Guild, GuildMember } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "../games/types";
import { defaultGame } from "../games/types";
import { Room } from "./Room";
import type { RoomData, RoomHooks } from "./types";

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

const mockPersist = vi.fn().mockResolvedValue(undefined);
const hooks: RoomHooks = { persist: mockPersist };

// カテゴリ・テキスト・VCの作成モックを設定してルームを作成するヘルパー
async function createRoom(options: { game?: Game; reserved?: boolean; eventId?: string } = {}) {
	const category = makeCategory("category-id");
	const textChannel = makeTextChannel("text-id");
	const voiceChannel = makeVoiceChannel("voice-id");

	mockChannelManager.create
		.mockResolvedValueOnce(category)
		.mockResolvedValueOnce(textChannel)
		.mockResolvedValueOnce(voiceChannel);

	const room = new Room(
		mockGuild,
		{
			hostname: "TestRoom",
			ownerId: "owner-id",
			game: options.game,
			reserved: options.reserved,
			eventId: options.eventId,
		},
		hooks,
	);
	await room.create();

	mockChannelManager.resolve.mockImplementation((id: string) => {
		if (id === "voice-id") return voiceChannel;
		if (id === "text-id") return textChannel;
		return null;
	});

	return { room, category, textChannel, voiceChannel };
}

describe("Room", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPersist.mockResolvedValue(undefined);
		mockChannelManager.resolve.mockReturnValue(null);
	});

	// -----------------------------------------------------------------------
	// Room.create()
	// -----------------------------------------------------------------------
	describe("create()", () => {
		it("カテゴリ・テキストチャンネル・VCの3つが作成される", async () => {
			await createRoom();

			expect(mockChannelManager.create).toHaveBeenCalledTimes(3);
		});

		it("テキストチャンネルはparentにカテゴリが設定される", async () => {
			const { category } = await createRoom();

			const textChannelCallArgs = mockChannelManager.create.mock.calls[1][0];
			expect(textChannelCallArgs.parent).toBe(category);
			expect(textChannelCallArgs.type).toBe(ChannelType.GuildText);
		});

		it("VCはparentにカテゴリが設定される", async () => {
			const { category } = await createRoom();

			const vcCallArgs = mockChannelManager.create.mock.calls[2][0];
			expect(vcCallArgs.parent).toBe(category);
			expect(vcCallArgs.type).toBe(ChannelType.GuildVoice);
		});

		it("テキストチャンネルは @everyone の ViewChannel が deny で作成される", async () => {
			await createRoom();

			const textChannelCallArgs = mockChannelManager.create.mock.calls[1][0];
			expect(textChannelCallArgs.permissionOverwrites).toEqual([
				{ id: mockGuild.id, deny: ["ViewChannel"] },
			]);
		});

		it("初期ゲームが指定された場合、VC名がゲーム名になる", async () => {
			const game: Game = { id: "game-role-id", name: "ApexLegends", data: {} };
			await createRoom({ game });

			const vcCallArgs = mockChannelManager.create.mock.calls[2][0];
			expect(vcCallArgs.name).toBe("ApexLegends");
		});

		it("作成されたカテゴリのIDが返り値になる", async () => {
			const category = makeCategory("category-id");
			const textChannel = makeTextChannel("text-id");
			const voiceChannel = makeVoiceChannel("voice-id");

			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockResolvedValueOnce(textChannel)
				.mockResolvedValueOnce(voiceChannel);

			const room = new Room(mockGuild, { hostname: "TestRoom" }, hooks);
			const result = await room.create();

			expect(result).toBe("category-id");
		});

		it("作成完了時に永続化フックが呼ばれる", async () => {
			const { room } = await createRoom();

			expect(mockPersist).toHaveBeenCalledWith(room);
		});

		it("チャンネル作成が途中で失敗した場合、作成済みチャンネルを削除して再スローする", async () => {
			const category = makeCategory("category-id");
			const voiceChannel = makeVoiceChannel("voice-id");

			// カテゴリ作成は成功、テキストチャンネル作成は失敗、VC作成は成功
			mockChannelManager.create
				.mockResolvedValueOnce(category)
				.mockRejectedValueOnce(new Error("テキストチャンネル作成失敗"))
				.mockResolvedValueOnce(voiceChannel);
			mockChannelManager.delete.mockResolvedValue(undefined);

			const room = new Room(mockGuild, { hostname: "TestRoom" }, hooks);

			await expect(room.create()).rejects.toThrow("テキストチャンネル作成失敗");

			// 作成済みのカテゴリとVCが掃除される
			expect(mockChannelManager.delete).toHaveBeenCalledWith("category-id");
			expect(mockChannelManager.delete).toHaveBeenCalledWith("voice-id");
			expect(mockPersist).not.toHaveBeenCalled();
			expect(room.id).toBeUndefined();
		});
	});

	// -----------------------------------------------------------------------
	// Room.toData()
	// -----------------------------------------------------------------------
	describe("toData()", () => {
		it("チャンネルが初期化済みのとき、全フィールドが正しく含まれたオブジェクトを返す", async () => {
			const { room } = await createRoom({ reserved: false, eventId: "event-id" });
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
			// createdAt は ISO 文字列として保存される
			expect(new Date(data.createdAt).getTime()).not.toBeNaN();
		});

		it("チャンネルが未初期化のときはエラーをスローする", () => {
			const room = new Room(mockGuild, { hostname: "TestRoom" }, hooks);
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
			createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
			channels: {
				categoryId: "category-id",
				textChannelId: "text-id",
				voiceChannelId: "voice-id",
				additionalVoiceChannelIds: ["add-vc-1"],
			},
			eventId: "event-id",
		};

		it("保存データからRoomインスタンスが復元され、各チャンネルIDが正しくセットされる", () => {
			const game: Game = { id: "game-role-id", name: "ApexLegends", data: {} };
			const room = Room.fromData(mockGuild, baseData, game, hooks);

			expect(room.id).toBe("category-id");
			const data = room.toData();
			expect(data.channels.categoryId).toBe("category-id");
			expect(data.channels.textChannelId).toBe("text-id");
			expect(data.channels.voiceChannelId).toBe("voice-id");
			expect(data.channels.additionalVoiceChannelIds).toEqual(["add-vc-1"]);
		});

		it("渡されたゲームが復元される", () => {
			const game: Game = { id: "game-role-id", name: "ApexLegends", data: {} };
			const room = Room.fromData(mockGuild, baseData, game, hooks);

			expect(room.game).toEqual(game);
			expect(room.toData().gameId).toBe("game-role-id");
		});

		it("createdAt が保存データから復元される（保存のたびに更新されない）", () => {
			const game: Game = { id: "game-role-id", name: "ApexLegends", data: {} };
			const room = Room.fromData(mockGuild, baseData, game, hooks);

			expect(room.toData().createdAt).toBe(baseData.createdAt);
		});
	});

	// -----------------------------------------------------------------------
	// Room.members（ゲッター）
	// -----------------------------------------------------------------------
	describe("members（ゲッター）", () => {
		it("メインVCと追加VC両方のメンバーが合算して返される", async () => {
			const member1 = makeMember("member-1");
			const member2 = makeMember("member-2");
			const mainVcMembers = new Collection<string, GuildMember>([["member-1", member1]]);
			const addVcMembers = new Collection<string, GuildMember>([["member-2", member2]]);

			const { room, voiceChannel } = await createRoom();
			voiceChannel.members = mainVcMembers;

			const addVoiceChannel = makeVoiceChannel("add-vc-1", addVcMembers);
			mockChannelManager.create.mockResolvedValueOnce(addVoiceChannel);
			await room.setAdditionalVoiceChannels(1);

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				if (id === "add-vc-1") return addVoiceChannel;
				return null;
			});

			const members = room.members;
			expect(members.size).toBe(2);
			expect(members.has("member-1")).toBe(true);
			expect(members.has("member-2")).toBe(true);
		});

		it("Botユーザーは除外される", async () => {
			const humanMember = makeMember("human-1", false);
			const botMember = makeMember("bot-1", true);
			const vcMembers = new Collection<string, GuildMember>([
				["human-1", humanMember],
				["bot-1", botMember],
			]);

			const { room, voiceChannel } = await createRoom();
			voiceChannel.members = vcMembers;

			const members = room.members;
			expect(members.size).toBe(1);
			expect(members.has("human-1")).toBe(true);
			expect(members.has("bot-1")).toBe(false);
		});

		it("VCにメンバーがいない場合は空のCollectionを返す", async () => {
			const { room } = await createRoom();

			const members = room.members;
			expect(members.size).toBe(0);
		});
	});

	// -----------------------------------------------------------------------
	// Room.delete()
	// -----------------------------------------------------------------------
	describe("delete()", () => {
		it("reserved === true のときは削除せず false を返す", async () => {
			const { room } = await createRoom({ reserved: true });

			const result = await room.delete();

			expect(result).toBe(false);
			expect(mockChannelManager.delete).not.toHaveBeenCalled();
		});

		it("unreserve() 後は削除できる", async () => {
			const { room } = await createRoom({ reserved: true });
			mockChannelManager.delete.mockResolvedValue(undefined);

			room.unreserve();
			const result = await room.delete();

			expect(result).toBe(true);
		});

		it("VCにメンバーがいるときは削除せず false を返す", async () => {
			const member = makeMember("member-1");
			const { room, voiceChannel } = await createRoom();
			voiceChannel.members = new Collection([["member-1", member]]);

			const result = await room.delete();

			expect(result).toBe(false);
			expect(mockChannelManager.delete).not.toHaveBeenCalled();
		});

		it("条件を満たせば追加VCを含む全チャンネルを削除して true を返す", async () => {
			const { room, voiceChannel } = await createRoom();

			const addVoiceChannel = makeVoiceChannel("add-vc-1");
			mockChannelManager.create.mockResolvedValueOnce(addVoiceChannel);
			await room.setAdditionalVoiceChannels(1);

			mockChannelManager.resolve.mockImplementation((id: string) => {
				if (id === "voice-id") return voiceChannel;
				if (id === "add-vc-1") return addVoiceChannel;
				return null;
			});
			mockChannelManager.delete.mockResolvedValue(undefined);

			const result = await room.delete();

			expect(result).toBe(true);
			// 追加VC・メインVC・テキストチャンネル・カテゴリが削除される
			expect(mockChannelManager.delete).toHaveBeenCalledWith("add-vc-1");
			expect(mockChannelManager.delete).toHaveBeenCalledWith("voice-id");
			expect(mockChannelManager.delete).toHaveBeenCalledWith("text-id");
			expect(mockChannelManager.delete).toHaveBeenCalledWith("category-id");
		});

		it("並行して呼ばれた場合も削除処理は1回しか実行されない", async () => {
			const { room } = await createRoom();

			let resolveDelete: () => void = () => {};
			mockChannelManager.delete.mockImplementation(
				() => new Promise<void>((resolve) => (resolveDelete = resolve)),
			);

			// 1回目の削除が進行中に2回目を呼ぶ
			const first = room.delete();
			const second = room.delete();

			// 進行中のチャンネル削除を全て完了させる
			while (mockChannelManager.delete.mock.calls.length < 3) {
				resolveDelete();
				await Promise.resolve();
			}
			resolveDelete();

			const [firstResult, secondResult] = await Promise.all([first, second]);

			expect(firstResult).toBe(true);
			expect(secondResult).toBe(true);
			// カテゴリ・テキスト・VCで3回（二重実行なら6回になる）
			expect(mockChannelManager.delete).toHaveBeenCalledTimes(3);
		});

		it("チャンネル削除が失敗した場合は再スローする（残骸はreconcileが回収）", async () => {
			const { room } = await createRoom();
			mockChannelManager.delete.mockRejectedValue(new Error("Missing Permissions"));

			await expect(room.delete()).rejects.toThrow("Missing Permissions");
		});
	});

	// -----------------------------------------------------------------------
	// Room.setGame()
	// -----------------------------------------------------------------------
	describe("setGame()", () => {
		it("同じゲームIDを渡したときは何もしない", async () => {
			const game: Game = { id: "apex-role-id", name: "ApexLegends", data: {} };
			const { room } = await createRoom({ game });
			mockPersist.mockClear();

			await room.setGame({ ...game });

			expect(room.game.name).toBe("ApexLegends");
			expect(mockPersist).not.toHaveBeenCalled();
		});

		it("別のゲームを渡したときはゲームを切り替えて永続化し、VC名を更新する", async () => {
			const { room, voiceChannel } = await createRoom();
			mockPersist.mockClear();

			const game: Game = { id: "apex-role-id", name: "ApexLegends", data: {} };
			await room.setGame(game);

			expect(room.game).toEqual(game);
			expect(mockPersist).toHaveBeenCalledWith(room);
			// VC名の反映はベストエフォートの非同期処理
			await vi.waitFor(() => {
				expect(voiceChannel.setName).toHaveBeenCalledWith("ApexLegends");
			});
		});

		it("VC名変更が失敗してもゲームの状態と永続化は維持される", async () => {
			const { room, voiceChannel } = await createRoom();
			voiceChannel.setName.mockRejectedValue(new Error("rate limited"));
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

			const game: Game = { id: "apex-role-id", name: "ApexLegends", data: {} };
			await room.setGame(game);

			expect(room.game).toEqual(game);
			expect(mockPersist).toHaveBeenCalledWith(room);
			await vi.waitFor(() => {
				expect(consoleErrorSpy).toHaveBeenCalled();
			});
			consoleErrorSpy.mockRestore();
		});

		it("名前変更が連続した場合は最新の名前だけが反映される", async () => {
			const { room, voiceChannel } = await createRoom();

			// 1回目の setName を保留にして、その間に次のゲーム変更を行う
			let resolveFirstRename: () => void = () => {};
			voiceChannel.setName.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						resolveFirstRename = resolve;
					}),
			);

			await room.setGame({ id: "game-1", name: "GameOne", data: {} });
			await vi.waitFor(() => {
				expect(voiceChannel.setName).toHaveBeenCalledWith("GameOne");
			});

			// 1回目のrenameが進行中に2つの変更を要求
			await room.setGame({ id: "game-2", name: "GameTwo", data: {} });
			await room.setGame({ id: "game-3", name: "GameThree", data: {} });

			resolveFirstRename();

			// 中間の GameTwo はスキップされ、最新の GameThree だけが反映される
			await vi.waitFor(() => {
				expect(voiceChannel.setName).toHaveBeenCalledWith("GameThree");
			});
			expect(voiceChannel.setName).not.toHaveBeenCalledWith("GameTwo");
		});
	});

	// -----------------------------------------------------------------------
	// Room.setAdditionalVoiceChannels()
	// -----------------------------------------------------------------------
	describe("setAdditionalVoiceChannels()", () => {
		it("現在より多い数を指定したとき、差分のVCが追加される（名前は VC [1], VC [2] ...）", async () => {
			const { room } = await createRoom();
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

		it("変更後に永続化フックが呼ばれる", async () => {
			const { room } = await createRoom();
			mockChannelManager.create.mockReset();
			mockPersist.mockClear();

			const addVc1 = makeVoiceChannel("add-vc-1");
			mockChannelManager.create.mockResolvedValueOnce(addVc1);

			await room.setAdditionalVoiceChannels(1);

			expect(mockPersist).toHaveBeenCalledWith(room);
		});

		it("現在より少ない数を指定したとき、末尾から差分のVCが削除される", async () => {
			const { room } = await createRoom();
			mockChannelManager.create.mockReset();

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
			const { room } = await createRoom();
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
			const { room } = await createRoom();
			mockChannelManager.create.mockReset();

			const addVc1 = makeVoiceChannel("add-vc-1");
			mockChannelManager.create.mockResolvedValueOnce(addVc1);
			await room.setAdditionalVoiceChannels(1);

			mockChannelManager.create.mockReset();
			mockChannelManager.delete.mockReset();
			mockPersist.mockClear();

			// 同じ数を指定
			const result = await room.setAdditionalVoiceChannels(1);

			expect(result).toBe(1);
			expect(mockChannelManager.create).not.toHaveBeenCalled();
			expect(mockChannelManager.delete).not.toHaveBeenCalled();
			expect(mockPersist).not.toHaveBeenCalled();
		});

		it("途中で失敗した場合、作成できた分は状態に反映して永続化してから再スローする", async () => {
			const { room } = await createRoom();
			mockChannelManager.create.mockReset();
			mockPersist.mockClear();

			const addVc1 = makeVoiceChannel("add-vc-1");
			mockChannelManager.create
				.mockResolvedValueOnce(addVc1)
				.mockRejectedValueOnce(new Error("作成失敗"));

			await expect(room.setAdditionalVoiceChannels(2)).rejects.toThrow("作成失敗");

			expect(room.additionalVoiceChannelCount).toBe(1);
			expect(mockPersist).toHaveBeenCalledWith(room);
		});
	});

	// -----------------------------------------------------------------------
	// Room.setTextChannelVisibility()
	// -----------------------------------------------------------------------
	describe("setTextChannelVisibility()", () => {
		it("visible: true のとき ViewChannel: true で権限を編集する", async () => {
			const { room, textChannel } = await createRoom();
			const member = makeMember("member-1");

			await room.setTextChannelVisibility(member, true);

			expect(textChannel.permissionOverwrites.edit).toHaveBeenCalledWith(member, {
				ViewChannel: true,
			});
		});

		it("visible: false のとき ViewChannel: null で権限を編集する（剥奪ではなく継承に戻す）", async () => {
			const { room, textChannel } = await createRoom();
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
			const member1 = makeMember("member-1");
			const member2 = makeMember("member-2");
			const { room, textChannel, voiceChannel } = await createRoom();
			voiceChannel.members = new Collection<string, GuildMember>([
				["member-1", member1],
				["member-2", member2],
			]);

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
		it("指定インデックスのVCに voiceState.setChannel() を呼ぶ", async () => {
			const { room } = await createRoom();
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
			const { room } = await createRoom();
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
			const { room } = await createRoom();
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
			const { room } = await createRoom();
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

			const { room, voiceChannel } = await createRoom();
			voiceChannel.members = new Collection<string, GuildMember>([
				["member-1", member1],
				["member-2", member2],
			]);

			await room.callMembers(0);

			expect(setChannel1).toHaveBeenCalledWith("voice-id");
			expect(setChannel2).toHaveBeenCalledWith("voice-id");
		});
	});

	// -----------------------------------------------------------------------
	// Room.hasVoiceChannel()
	// -----------------------------------------------------------------------
	describe("hasVoiceChannel()", () => {
		it("メインVC・追加VCのIDに対して true を返す", async () => {
			const { room } = await createRoom();

			const addVc1 = makeVoiceChannel("add-vc-1");
			mockChannelManager.create.mockResolvedValueOnce(addVc1);
			await room.setAdditionalVoiceChannels(1);

			expect(room.hasVoiceChannel("voice-id")).toBe(true);
			expect(room.hasVoiceChannel("add-vc-1")).toBe(true);
			expect(room.hasVoiceChannel("other-id")).toBe(false);
		});
	});
});
