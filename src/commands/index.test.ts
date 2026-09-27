import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TIMEOUT } from "../constants";
import { apiRequest } from "../testing/discord/server";
import { createWorld, type World } from "../testing/world";

let world: World;

beforeEach(async () => {
	world = await createWorld();
});

afterEach(() => {
	world.dispose();
});

describe("コマンド共通", () => {
	it("登録されていないコマンドを受け取った場合は、実行者にだけ伝える", async () => {
		const alice = world.addMember("alice");

		const run = await alice.run("unknown", world.generalChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["不明なコマンドです"]);
	});

	it("処理中に想定外のエラーが起きた場合は、全員に見える応答を取り下げて実行者にだけ伝える", async () => {
		const { room, members } = await world.setupRoom("alice", "bob");
		world.server.fail(apiRequest("PATCH", /\/messages\/(?:@|%40)original$/));

		const run = await members[0].run("team", room.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["コマンドの実行中にエラーが発生しました"]);
	});

	it("Botの再起動前に表示されたボタンを押すと、操作した人にだけ期限切れを伝える", async () => {
		const { room, members } = await world.setupRoom("alice", "bob");
		const run = await members[0].run("team", room.textChannel);
		await members[0].click(run.response, "confirm");
		await world.restartBot();

		const record = await members[0].click(run.response, "move");
		await world.advance(TIMEOUT.ORPHANED_COMPONENT_GRACE);

		expect(record.privateMessages).toEqual([
			"この操作は期限切れです\nコマンドを再実行してください",
		]);
	});
});
