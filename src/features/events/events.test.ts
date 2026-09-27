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
