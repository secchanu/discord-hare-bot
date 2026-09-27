import { ChannelType } from "discord.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TIME } from "../../constants";
import { apiRequest } from "../../testing/discord/server";
import { createWorld, type World } from "../../testing/world";

let world: World;

beforeEach(async () => {
	world = await createWorld();
});

afterEach(() => {
	world.dispose();
});

describe("ルームの作成", () => {
	it("準備チャンネルに入ると、表示名のカテゴリに専用チャットとボイスチャンネルが作られ、そのボイスチャンネルへ移動する", async () => {
		const alice = world.addMember("alice");

		const room = await alice.createRoom();

		expect(room.textChannel.name).toBe("専用チャット");
		expect(room.voiceChannels).toHaveLength(1);
		expect(alice.voiceChannelId).toBe(room.voiceChannel.id);
	});

	it("専用チャットはルームのボイスチャンネルにいるメンバーにだけ見える", async () => {
		const alice = world.addMember("alice");
		const bob = world.addMember("bob");

		const room = await alice.createRoom();

		expect(alice.canView(room.textChannel)).toBe(true);
		expect(bob.canView(room.textChannel)).toBe(false);
	});

	it("募集をしていない場合、ボイスチャンネル名はデフォルトのゲーム名になる", async () => {
		const room = await world.addMember("alice").createRoom();

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("直前の募集でメンションした自分のロールのゲームで作られる", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		await alice.post(world.wantedChannel, { mentions: [apex] });

		const room = await alice.createRoom();

		expect(room.voiceChannel.name).toBe("APEX");
	});

	it("募集から6時間以内ならそのゲームで作られる（境界値）", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		await alice.post(world.wantedChannel, { mentions: [apex] });

		await world.advance(6 * TIME.HOUR);
		const room = await alice.createRoom();

		expect(room.voiceChannel.name).toBe("APEX");
	});

	it("募集から6時間を過ぎるとデフォルトのゲームで作られる（境界値）", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		await alice.post(world.wantedChannel, { mentions: [apex] });

		await world.advance(6 * TIME.HOUR + 1);
		const room = await alice.createRoom();

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("持っていないロールをメンションした募集はゲームに使わない", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice");
		await alice.post(world.wantedChannel, { mentions: [apex] });

		const room = await alice.createRoom();

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("除外ロールをメンションした募集はゲームに使わない", async () => {
		const alice = world.addMember("alice", { roles: [world.ignoredRole] });
		await alice.post(world.wantedChannel, { mentions: [world.ignoredRole] });

		const room = await alice.createRoom();

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("他の人の募集はゲームに使わない", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		const bob = world.addMember("bob", { roles: [apex] });
		await bob.post(world.wantedChannel, { mentions: [apex] });

		const room = await alice.createRoom();

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("チャンネルの作成に失敗した場合、作りかけのチャンネルを残さない", async () => {
		const alice = world.addMember("alice");
		world.server.fail(
			(request) =>
				apiRequest("POST", /\/channels$/)(request) &&
				(request.body as { type: ChannelType }).type === ChannelType.GuildVoice,
		);

		await alice.joinVoice(world.readyChannel);

		expect(world.findRoom("alice")).toBeUndefined();
		expect(
			[...world.server.channels.values()].filter((channel) => channel.name === "専用チャット"),
		).toEqual([]);
	});
});

describe("ルームへの出入り", () => {
	it("ルームのボイスチャンネルに入ったメンバーには専用チャットが見えるようになる", async () => {
		const room = await world.addMember("alice").createRoom();
		const bob = world.addMember("bob");

		await bob.joinVoice(room.voiceChannel);

		expect(bob.canView(room.textChannel)).toBe(true);
	});

	it("ルーム内の別のボイスチャンネルへ移ってもルームは残る", async () => {
		const { room, members } = await world.setupRoom("alice");
		const [alice] = members;
		await alice.run("room vc", room.textChannel, { number: 1 });

		await alice.joinVoice(room.additionalVoiceChannels[0]);

		expect(room.exists).toBe(true);
	});

	it("メンバーが残っている間はルームを削除しない", async () => {
		const { room, members } = await world.setupRoom("alice", "bob");
		const [alice] = members;

		await alice.leaveVoice();

		expect(room.exists).toBe(true);
	});

	it("最後のメンバーが抜けると、追加ボイスチャンネルを含むルームのチャンネルをすべて削除する", async () => {
		const { room, members } = await world.setupRoom("alice");
		const [alice] = members;
		await alice.run("room vc", room.textChannel, { number: 2 });
		const channelIds = [
			room.categoryId,
			room.textChannel.id,
			...room.voiceChannels.map((channel) => channel.id),
		];

		await alice.leaveVoice();

		expect(channelIds.filter((id) => world.channel(id))).toEqual([]);
	});

	it("Botだけが残ったルームは削除する", async () => {
		const alice = world.addMember("alice");
		const room = await alice.createRoom();
		const bot = world.addMember("music-bot", { bot: true });
		await bot.joinVoice(room.voiceChannel);

		await alice.leaveVoice();

		expect(room.exists).toBe(false);
	});

	it("全員が同時に抜けても、ルームを削除する", async () => {
		const { room, members } = await world.setupRoom("alice", "bob");

		for (const member of members) world.server.setVoiceChannel(member.id, null);
		await world.settle();

		expect(room.exists).toBe(false);
		expect(await world.savedRooms()).toEqual([]);
	});
});

describe("募集によるゲームの切り替え", () => {
	it("ルームにいるメンバーが自分のロールをメンションして募集すると、ボイスチャンネル名がそのゲームになる", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		const room = await alice.createRoom();

		await alice.post(world.wantedChannel, { mentions: [apex] });

		expect(room.voiceChannel.name).toBe("APEX");
	});

	it("@everyone をメンションして募集するとデフォルトのゲームに戻る", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		const room = await alice.createRoom();
		await alice.post(world.wantedChannel, { mentions: [apex] });

		await alice.post(world.wantedChannel, { mentionEveryone: true });

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("持っていないロールをメンションしても変わらない", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice");
		const room = await alice.createRoom();

		await alice.post(world.wantedChannel, { mentions: [apex] });

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("除外ロールをメンションしても変わらない", async () => {
		const alice = world.addMember("alice", { roles: [world.ignoredRole] });
		const room = await alice.createRoom();

		await alice.post(world.wantedChannel, { mentions: [world.ignoredRole] });

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("募集チャンネル以外への投稿では変わらない", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		const room = await alice.createRoom();

		await alice.post(world.generalChannel, { mentions: [apex] });

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("ルームにいないメンバーの募集では、どのルームも変わらない", async () => {
		const apex = world.addRole("APEX");
		const room = await world.addMember("alice", { roles: [apex] }).createRoom();
		const bob = world.addMember("bob", { roles: [apex] });

		await bob.post(world.wantedChannel, { mentions: [apex] });

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("Botの投稿では変わらない", async () => {
		const apex = world.addRole("APEX");
		const room = await world.addMember("alice").createRoom();
		const bot = world.addMember("music-bot", { roles: [apex], bot: true });
		await bot.joinVoice(room.voiceChannel);

		await bot.post(world.wantedChannel, { mentions: [apex] });

		expect(room.voiceChannel.name).toBe("Free");
	});

	it("ゲームの変更が続いた場合、途中のゲーム名は付けず最後のゲーム名を付ける", async () => {
		const [apex, valorant, lol] = ["APEX", "VALORANT", "LoL"].map((name) => world.addRole(name));
		const alice = world.addMember("alice", { roles: [apex, valorant, lol] });
		const room = await alice.createRoom();
		const release = world.server.hold(
			(request) =>
				apiRequest("PATCH", new RegExp(`^/channels/${room.voiceChannel.id}$`))(request) &&
				"name" in (request.body as object),
		);

		await alice.post(world.wantedChannel, { mentions: [apex] });
		await alice.post(world.wantedChannel, { mentions: [valorant] });
		await alice.post(world.wantedChannel, { mentions: [lol] });
		release();
		await world.settle();

		expect(room.voiceChannel.nameHistory).toEqual(["Free", "APEX", "LoL"]);
	});

	it("ボイスチャンネル名の変更に失敗しても、ルームのゲームは切り替わる", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		const room = await alice.createRoom();
		world.server.fail(apiRequest("PATCH", new RegExp(`^/channels/${room.voiceChannel.id}$`)));

		await alice.post(world.wantedChannel, { mentions: [apex] });
		const run = await alice.run("rand data", room.textChannel);

		expect(run.privateMessages).toEqual([
			"抽選できるデータがありません\n部屋のゲームを確認してください\n現在のゲームは「APEX」です",
		]);
	});
});

describe("Bot の再起動", () => {
	it("再起動後も、ルームと追加ボイスチャンネルを使い続けられる", async () => {
		const { room, members } = await world.setupRoom("alice", "bob");
		const [alice] = members;
		await alice.run("room vc", room.textChannel, { number: 1 });

		await world.restartBot();
		await alice.run("call", room.textChannel, { number: 1 });

		for (const member of members) {
			expect(member.voiceChannelId).toBe(room.additionalVoiceChannels[0].id);
		}
	});

	it("停止中に全員が抜けたルームは、起動時に削除する", async () => {
		const { room, members } = await world.setupRoom("alice");
		world.stopBot();
		world.server.setVoiceChannel(members[0].id, null);

		await world.startBot();

		expect(room.exists).toBe(false);
		expect(await world.savedRooms()).toEqual([]);
	});

	it("起動時にメンバーがいるルームは残す", async () => {
		const { room } = await world.setupRoom("alice");

		await world.restartBot();

		expect(room.exists).toBe(true);
	});

	it("停止中にカテゴリが消えたルームは、起動時に保存データから消す", async () => {
		const { room } = await world.setupRoom("alice");
		world.stopBot();
		world.server.channels.delete(room.categoryId);

		await world.startBot();

		expect(await world.savedRooms()).toEqual([]);
	});

	it("復元できないルームがあっても、他のルームは復元する", async () => {
		const { room: lost } = await world.setupRoom("alice");
		const { room, members } = await world.setupRoom("bob", "carol");
		world.stopBot();
		world.server.channels.delete(lost.categoryId);

		await world.startBot();
		const run = await members[0].run("call", room.textChannel);

		expect(run.publicMessages).toEqual(["メンバーを集合させました"]);
	});

	it("起動時に1つのルームの削除に失敗しても、他の空のルームは削除する", async () => {
		const { room: failing, members: failingMembers } = await world.setupRoom("alice");
		const { room, members } = await world.setupRoom("bob");
		world.stopBot();
		for (const member of [...failingMembers, ...members]) {
			world.server.setVoiceChannel(member.id, null);
		}
		world.server.fail(apiRequest("DELETE", new RegExp(`^/channels/${failing.textChannel.id}$`)));

		await world.startBot();

		expect(failing.exists).toBe(true);
		expect(room.exists).toBe(false);
	});

	it("抜けたときにチャンネルの削除に失敗したルームは、次の起動時に削除する", async () => {
		const { room, members } = await world.setupRoom("alice");
		const restore = world.server.fail(
			apiRequest("DELETE", new RegExp(`^/channels/${room.textChannel.id}$`)),
		);
		await members[0].leaveVoice();
		restore();

		await world.restartBot();

		expect(room.exists).toBe(false);
	});

	it("別のサーバーのルームは、起動時に保存データから消す", async () => {
		const { room } = await world.setupRoom("alice");
		world.stopBot();
		const [saved] = await world.savedRooms();
		await world.roomStore().set(saved.id, { ...saved, guildId: "other-guild" });

		await world.startBot();

		expect(await world.savedRooms()).toEqual([]);
		expect(room.exists).toBe(true);
	});
});
