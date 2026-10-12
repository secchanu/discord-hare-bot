import { ChannelType, GuildScheduledEventStatus } from "discord.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiRequest } from "../../testing/discord/server";
import { createWorld, type World } from "../../testing/world";

let world: World;

beforeEach(async () => {
	world = await createWorld();
});

afterEach(() => {
	world.dispose();
});

/**
 * 準備チャンネルを場所にしたイベントを作り、そのルームを返す
 */
async function createEventRoom(name = "大会") {
	const event = await world.createScheduledEvent(name, world.readyChannel);
	const room = world.findRoom(name);
	if (!room) throw new Error("イベントのルームが作られていません");
	return { event, room };
}

describe("イベントのルームの作成", () => {
	it("準備チャンネルを場所にしたイベントを作ると、イベント名のルームが作られ、イベントの場所がルームのボイスチャンネルになる", async () => {
		const { event, room } = await createEventRoom("大会");

		expect(room.textChannel.name).toBe("専用チャット");
		expect(event.channelId).toBe(room.voiceChannel.id);
	});

	it("準備チャンネル以外を場所にしたイベントでは、ルームを作らない", async () => {
		await world.createScheduledEvent("大会", world.addVoiceChannel("雑談"));

		expect(world.findRoom("大会")).toBeUndefined();
	});

	it("イベントの作成が重複して届いても、ルームは1つだけ作る", async () => {
		const { event } = await createEventRoom("大会");

		world.server.dispatch(
			"GUILD_SCHEDULED_EVENT_CREATE",
			world.server.rawScheduledEvent({ ...event.state, channelId: world.readyChannel.id }),
		);
		await world.settle();

		const categories = [...world.server.channels.values()].filter(
			(channel) => channel.type === ChannelType.GuildCategory && channel.name === "大会",
		);
		expect(categories).toHaveLength(1);
	});

	it("ルームの作成に失敗した場合は、ルームを作らない", async () => {
		world.server.fail(apiRequest("POST", /\/channels$/));

		await world.createScheduledEvent("大会", world.readyChannel);

		expect(world.findRoom("大会")).toBeUndefined();
	});

	it("場所を準備チャンネルに変えたイベントには、ルームを作り、参加登録済みのメンバーに専用チャットを見せる", async () => {
		const event = await world.createScheduledEvent("大会", world.addVoiceChannel("雑談"));
		const bob = world.addMember("bob");
		await event.subscribe(bob);

		await event.moveTo(world.readyChannel);

		const room = world.findRoom("大会");
		expect(room?.exists).toBe(true);
		expect(room && bob.canView(room.textChannel)).toBe(true);
	});
});

describe("参加登録", () => {
	it("参加登録したメンバーには専用チャットが見える", async () => {
		const { event, room } = await createEventRoom();
		const bob = world.addMember("bob");

		await event.subscribe(bob);

		expect(bob.canView(room.textChannel)).toBe(true);
	});

	it("参加登録を取り消したメンバーには専用チャットが見えなくなる", async () => {
		const { event, room } = await createEventRoom();
		const bob = world.addMember("bob");
		await event.subscribe(bob);

		await event.unsubscribe(bob);

		expect(bob.canView(room.textChannel)).toBe(false);
	});

	it("ボイスチャンネルにいる間は、参加登録を取り消しても専用チャットが見えたまま", async () => {
		const { event, room } = await createEventRoom();
		const bob = world.addMember("bob");
		await event.subscribe(bob);
		await bob.joinVoice(room.voiceChannel);

		await event.unsubscribe(bob);

		expect(bob.canView(room.textChannel)).toBe(true);
	});

	it("参加登録を取り消すと、ボイスチャンネルに入ったことのあるメンバーにも専用チャットが見えなくなる", async () => {
		const { event, room } = await createEventRoom();
		const bob = world.addMember("bob");
		await event.subscribe(bob);
		await bob.joinVoice(room.voiceChannel);
		await bob.leaveVoice();

		await event.unsubscribe(bob);

		expect(bob.canView(room.textChannel)).toBe(false);
	});

	it("参加登録者が100人を超えても、全員に専用チャットが見える（境界値）", async () => {
		const event = await world.createScheduledEvent("大会", world.addVoiceChannel("雑談"));
		const members = Array.from({ length: 101 }, (_, i) => world.addMember(`member${i}`));
		for (const member of members) await event.subscribe(member);

		await event.moveTo(world.readyChannel);

		const room = world.findRoom("大会");
		if (!room) throw new Error("イベントのルームが作られていません");
		expect(members.filter((member) => !member.canView(room.textChannel))).toEqual([]);
	});

	it("専用チャットの権限の反映中に参加登録を取り消したメンバーには、専用チャットが見えない", async () => {
		const { event, room } = await createEventRoom();
		const bob = world.addMember("bob");
		const release = world.server.hold(
			apiRequest("PATCH", new RegExp(`^/channels/${room.textChannel.id}$`)),
		);
		await event.subscribe(bob);

		await event.unsubscribe(bob);
		release();
		await world.settle();

		expect(bob.canView(room.textChannel)).toBe(false);
	});

	it("専用チャットの権限の反映に失敗したメンバーにも、次に参加登録が変化したときに専用チャットが見える", async () => {
		const { event, room } = await createEventRoom();
		const bob = world.addMember("bob");
		const recover = world.server.fail(
			apiRequest("PATCH", new RegExp(`^/channels/${room.textChannel.id}$`)),
		);
		await event.subscribe(bob);
		recover();

		await event.subscribe(world.addMember("carol"));

		expect(bob.canView(room.textChannel)).toBe(true);
	});
});

describe("イベントのルームへの出入り", () => {
	it("参加登録していないメンバーは、ボイスチャンネルにいる間だけ専用チャットが見える", async () => {
		const { room } = await createEventRoom();
		const bob = world.addMember("bob");
		await bob.joinVoice(room.voiceChannel);
		const visibleInVoice = bob.canView(room.textChannel);

		await bob.leaveVoice();

		expect([visibleInVoice, bob.canView(room.textChannel)]).toEqual([true, false]);
	});

	it("参加登録したメンバーは、ボイスチャンネルから抜けても専用チャットが見えたまま", async () => {
		const { event, room } = await createEventRoom();
		const bob = world.addMember("bob");
		await event.subscribe(bob);
		await bob.joinVoice(room.voiceChannel);

		await bob.leaveVoice();

		expect(bob.canView(room.textChannel)).toBe(true);
	});
});

describe("イベントの終了後のルーム（通常のルームと同等）", () => {
	it("ボイスチャンネルから抜けた参加登録していないメンバーにも、専用チャットが見えたまま", async () => {
		const { event, room } = await createEventRoom();
		const [alice, bob] = [world.addMember("alice"), world.addMember("bob")];
		await alice.joinVoice(room.voiceChannel);
		await bob.joinVoice(room.voiceChannel);
		await event.setStatus(GuildScheduledEventStatus.Completed);

		await bob.leaveVoice();

		expect(bob.canView(room.textChannel)).toBe(true);
	});

	it("専用チャットを同期すると、ボイスチャンネルにいない参加登録者には専用チャットが見えなくなる", async () => {
		const { event, room } = await createEventRoom();
		const [alice, bob] = [world.addMember("alice"), world.addMember("bob")];
		await event.subscribe(bob);
		await alice.joinVoice(room.voiceChannel);
		await event.setStatus(GuildScheduledEventStatus.Completed);

		await alice.run("room sync", room.textChannel);

		expect(bob.canView(room.textChannel)).toBe(false);
	});
});

describe("イベントのルームの維持と削除", () => {
	it("イベントのルームは、誰もいなくなっても削除しない", async () => {
		const { room } = await createEventRoom();
		const alice = world.addMember("alice");
		await alice.joinVoice(room.voiceChannel);

		await alice.leaveVoice();

		expect(room.exists).toBe(true);
	});

	it("イベントが開始されてもルームは残す", async () => {
		const { event, room } = await createEventRoom();

		await event.setStatus(GuildScheduledEventStatus.Active);

		expect(room.exists).toBe(true);
	});

	it("イベントが終了すると、誰もいないルームを削除する", async () => {
		const { event, room } = await createEventRoom();

		await event.setStatus(GuildScheduledEventStatus.Completed);

		expect(room.exists).toBe(false);
	});

	it("イベントが中止されると、誰もいないルームを削除する", async () => {
		const { event, room } = await createEventRoom();

		await event.setStatus(GuildScheduledEventStatus.Canceled);

		expect(room.exists).toBe(false);
	});

	it("イベントが削除されると、誰もいないルームを削除する", async () => {
		const { event, room } = await createEventRoom();

		await event.delete();

		expect(room.exists).toBe(false);
	});

	it("イベントの終了時にメンバーがいるルームは、最後のメンバーが抜けたときに削除する", async () => {
		const { event, room } = await createEventRoom();
		const alice = world.addMember("alice");
		await alice.joinVoice(room.voiceChannel);
		await event.setStatus(GuildScheduledEventStatus.Completed);

		await alice.leaveVoice();

		expect(room.exists).toBe(false);
	});

	it("イベントの場所をルームの外に変えると、ルームを削除する", async () => {
		const { event, room } = await createEventRoom();

		await event.moveTo(world.addVoiceChannel("雑談"));

		expect(room.exists).toBe(false);
	});

	it("イベントの場所を準備チャンネルに戻しても、ルームを作り直さない", async () => {
		const { event, room } = await createEventRoom("大会");

		await event.moveTo(world.readyChannel);

		const categories = [...world.server.channels.values()].filter(
			(channel) => channel.type === ChannelType.GuildCategory && channel.name === "大会",
		);
		expect(categories.map((channel) => channel.id)).toEqual([room.categoryId]);
	});
});

describe("Bot の再起動", () => {
	it("起動時、予定どおりのイベントのルームは残す", async () => {
		const { room } = await createEventRoom();

		await world.restartBot();

		expect(room.exists).toBe(true);
	});

	it("停止中に参加登録したメンバーには、起動時に専用チャットが見える", async () => {
		const { event, room } = await createEventRoom();
		const bob = world.addMember("bob");
		world.stopBot();
		world.server.subscribeScheduledEvent(event.id, bob.id, true);

		await world.startBot();

		expect(bob.canView(room.textChannel)).toBe(true);
	});

	it("停止中に参加登録を取り消したメンバーには、起動時に専用チャットが見えなくなる", async () => {
		const { event, room } = await createEventRoom();
		const bob = world.addMember("bob");
		await event.subscribe(bob);
		world.stopBot();
		world.server.subscribeScheduledEvent(event.id, bob.id, false);

		await world.startBot();

		expect(bob.canView(room.textChannel)).toBe(false);
	});

	it("停止中にボイスチャンネルから抜けた参加登録していないメンバーには、起動時に専用チャットが見えなくなる", async () => {
		const { room } = await createEventRoom();
		const bob = world.addMember("bob");
		await bob.joinVoice(room.voiceChannel);
		world.stopBot();
		world.server.setVoiceChannel(bob.id, null);

		await world.startBot();

		expect(bob.canView(room.textChannel)).toBe(false);
	});

	it("停止中に終了したイベントのルームは、起動時に削除する", async () => {
		const { event, room } = await createEventRoom();
		world.stopBot();
		world.server.updateScheduledEvent(event.id, { status: GuildScheduledEventStatus.Completed });

		await world.startBot();

		expect(room.exists).toBe(false);
	});

	it("停止中に削除されたイベントのルームは、起動時に削除する", async () => {
		const { event, room } = await createEventRoom();
		world.stopBot();
		world.server.deleteScheduledEvent(event.id);

		await world.startBot();

		expect(room.exists).toBe(false);
	});
});
