import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

		const run = await members[0].run("member shuffle", world.generalChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("ボイスチャンネルに入っていない場合は実行者にだけエラーを返す", async () => {
		const { room } = await world.setupRoom("alice");

		const run = await world.addMember("bob").run("member shuffle", room.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});
});

describe("並び替え", () => {
	it("ボイスチャンネルのメンバー全員を、1から番号を付けて1人ずつ並べる", async () => {
		const { room, members } = await world.setupRoom("alice", "bob", "carol");

		const run = await members[0].run("member shuffle", room.textChannel);

		const lines = run.response.content.split("\n");
		expect(lines.map((line) => line.split(" ")[0])).toEqual(["1.", "2.", "3."]);
		expect(lines.map((line) => line.split(" ")[1]).sort()).toEqual(
			members.map((member) => member.mention).sort(),
		);
	});

	it("Botは並べない", async () => {
		const { room, members } = await world.setupRoom("alice");
		await world.addMember("music-bot", { bot: true }).joinVoice(room.voiceChannel);

		const run = await members[0].run("member shuffle", room.textChannel);

		expect(run.response.content).toBe(`1. ${members[0].mention}`);
	});
});
