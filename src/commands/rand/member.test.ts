import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorld, type World } from "../../testing/world";

let world: World;

beforeEach(async () => {
	world = await createWorld();
});

afterEach(() => {
	world.dispose();
});

/**
 * 表示からメンションを取り出す
 */
function mentionsIn(content: string): string[] {
	return content.split("\n");
}

describe("実行条件", () => {
	it("ルーム外から実行した場合は実行者にだけエラーを返す", async () => {
		const { members } = await world.setupRoom("alice");

		const run = await members[0].run("rand member", world.generalChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("ボイスチャンネルに入っていない場合は実行者にだけエラーを返す", async () => {
		const { room } = await world.setupRoom("alice");

		const run = await world.addMember("bob").run("rand member", room.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});
});

describe("選択", () => {
	it("0人以下は指定できない（境界値）", async () => {
		const { room, members } = await world.setupRoom("alice");

		await expect(members[0].run("rand member", room.textChannel, { number: 0 })).rejects.toThrow(
			RangeError,
		);
	});

	it("人数を指定しない場合は、ボイスチャンネルのメンバーから1人を選ぶ", async () => {
		const { room, members } = await world.setupRoom("alice", "bob", "carol");

		const run = await members[0].run("rand member", room.textChannel);

		const selected = mentionsIn(run.response.content);
		expect(selected).toHaveLength(1);
		expect(members.map((member) => member.mention)).toContain(selected[0]);
	});

	it("指定した人数を重複なく選ぶ", async () => {
		const { room, members } = await world.setupRoom("alice", "bob", "carol", "dave");

		const run = await members[0].run("rand member", room.textChannel, { number: 2 });

		const selected = mentionsIn(run.response.content);
		expect(new Set(selected).size).toBe(2);
	});

	it("メンバー数を超える人数を指定した場合は全員を選ぶ（境界値）", async () => {
		const { room, members } = await world.setupRoom("alice", "bob");

		const run = await members[0].run("rand member", room.textChannel, { number: 3 });

		expect(mentionsIn(run.response.content).sort()).toEqual(
			members.map((member) => member.mention).sort(),
		);
	});

	it("Botは選ばない", async () => {
		const { room, members } = await world.setupRoom("alice");
		await world.addMember("music-bot", { bot: true }).joinVoice(room.voiceChannel);

		const run = await members[0].run("rand member", room.textChannel, { number: 2 });

		expect(mentionsIn(run.response.content)).toEqual([members[0].mention]);
	});
});
