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

describe("実行条件", () => {
	it("ルーム外から実行した場合は実行者にだけエラーを返す", async () => {
		const { members } = await world.setupRoom("alice");

		const run = await members[0].run("room sync", world.generalChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});
});

describe("専用チャットの同期", () => {
	it("専用チャットを、ルームのボイスチャンネルにいるメンバーだけが見える状態にそろえる", async () => {
		const { room, members } = await world.setupRoom("alice", "bob", "carol");
		const [alice, bob, carol] = members;
		await alice.run("room vc", room.textChannel, { number: 1 });
		await carol.joinVoice(room.additionalVoiceChannels[0]);
		await bob.leaveVoice();

		const run = await alice.run("room sync", room.textChannel);

		expect(run.publicMessages).toEqual(["専用チャットを部屋のメンバーに同期しました"]);
		expect(members.map((member) => member.canView(room.textChannel))).toEqual([true, false, true]);
		expect(world.addMember("dave").canView(room.textChannel)).toBe(false);
	});

	it("同期に失敗した場合は、全員に見える応答を取り下げて実行者にだけ伝える", async () => {
		const { room, members } = await world.setupRoom("alice");
		world.server.fail(apiRequest("PATCH", new RegExp(`^/channels/${room.textChannel.id}$`)));

		const run = await members[0].run("room sync", room.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["同期中にエラーが発生しました"]);
	});
});
