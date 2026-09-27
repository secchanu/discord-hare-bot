import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiRequest } from "../testing/discord/server";
import { createWorld, type World } from "../testing/world";

let world: World;

beforeEach(async () => {
	world = await createWorld();
});

afterEach(() => {
	world.dispose();
});

/**
 * 追加ボイスチャンネルを2つ持つルームで、メンバーを追加ボイスチャンネルに散らした状態を作る
 */
async function setupScatteredRoom() {
	const { room, members } = await world.setupRoom("alice", "bob", "carol");
	const [alice, bob, carol] = members;
	await alice.run("room vc", room.textChannel, { number: 2 });
	const [vc1, vc2] = room.additionalVoiceChannels;
	await bob.joinVoice(vc1);
	await carol.joinVoice(vc2);
	return { room, members, alice };
}

describe("実行条件", () => {
	it("ルーム外から実行した場合は実行者にだけエラーを返す", async () => {
		const { members } = await world.setupRoom("alice");

		const run = await members[0].run("call", world.generalChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("ボイスチャンネルに入っていない場合は実行者にだけエラーを返す", async () => {
		const { room } = await world.setupRoom("alice");

		const run = await world.addMember("bob").run("call", room.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("負の番号は指定できない（境界値）", async () => {
		const { room, members } = await world.setupRoom("alice");

		await expect(members[0].run("call", room.textChannel, { number: -1 })).rejects.toThrow(
			RangeError,
		);
	});

	it("存在しないボイスチャンネルの番号を指定した場合は、誰も移動させず実行者にだけエラーを返す（境界値）", async () => {
		const { room, members, alice } = await setupScatteredRoom();
		const before = members.map((member) => member.voiceChannelId);

		const run = await alice.run("call", room.textChannel, { number: 3 });

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["3番のVCはありません（0〜2で指定してください）"]);
		expect(members.map((member) => member.voiceChannelId)).toEqual(before);
	});
});

describe("集合", () => {
	it("番号を指定しない場合は、ルームのボイスチャンネルに全員を集める", async () => {
		const { room, members, alice } = await setupScatteredRoom();

		const run = await alice.run("call", room.textChannel);

		expect(run.publicMessages).toEqual(["メンバーを集合させました"]);
		for (const member of members) expect(member.voiceChannelId).toBe(room.voiceChannel.id);
	});

	it("最後の追加ボイスチャンネルの番号を指定すると、そこに全員を集める（境界値）", async () => {
		const { room, members, alice } = await setupScatteredRoom();

		await alice.run("call", room.textChannel, { number: 2 });

		for (const member of members) {
			expect(member.voiceChannelId).toBe(room.additionalVoiceChannels[1].id);
		}
	});

	it("移動できなかったメンバーがいる場合は、全員に見える応答を取り下げて実行者にだけ伝える", async () => {
		const { room, members, alice } = await setupScatteredRoom();
		world.server.fail(apiRequest("PATCH", new RegExp(`/members/${members[1].id}$`)));

		const run = await alice.run("call", room.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["移動できなかったメンバーがいます"]);
	});
});
