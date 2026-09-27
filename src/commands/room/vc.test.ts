import { ChannelType } from "discord.js";
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

		const run = await members[0].run("room vc", world.generalChannel, { number: 1 });

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("追加ボイスチャンネルの数は0から25までしか指定できない（境界値）", async () => {
		const { room, members } = await world.setupRoom("alice");

		await expect(members[0].run("room vc", room.textChannel, { number: -1 })).rejects.toThrow(
			RangeError,
		);
		await expect(members[0].run("room vc", room.textChannel, { number: 26 })).rejects.toThrow(
			RangeError,
		);
		await members[0].run("room vc", room.textChannel, { number: 25 });
		expect(room.additionalVoiceChannels).toHaveLength(25);
	});
});

describe("追加ボイスチャンネルの変更", () => {
	it("指定した数の追加ボイスチャンネルを「VC [番号]」の名前で作る", async () => {
		const { room, members } = await world.setupRoom("alice");

		const run = await members[0].run("room vc", room.textChannel, { number: 2 });

		expect(run.publicMessages).toEqual(["追加VC数を2に変更しました"]);
		expect(room.additionalVoiceChannels.map((channel) => channel.name)).toEqual([
			"VC [1]",
			"VC [2]",
		]);
	});

	it("今より少ない数を指定すると、後ろから削除する", async () => {
		const { room, members } = await world.setupRoom("alice");
		await members[0].run("room vc", room.textChannel, { number: 3 });

		await members[0].run("room vc", room.textChannel, { number: 1 });

		expect(room.additionalVoiceChannels.map((channel) => channel.name)).toEqual(["VC [1]"]);
	});

	it("0を指定すると、追加ボイスチャンネルをすべて削除する", async () => {
		const { room, members } = await world.setupRoom("alice");
		await members[0].run("room vc", room.textChannel, { number: 2 });

		await members[0].run("room vc", room.textChannel, { number: 0 });

		expect(room.additionalVoiceChannels).toEqual([]);
	});

	it("変更に失敗した場合は、全員に見える応答を取り下げて実行者にだけ伝える", async () => {
		const { room, members } = await world.setupRoom("alice");
		world.server.fail(apiRequest("POST", /\/channels$/));

		const run = await members[0].run("room vc", room.textChannel, { number: 1 });

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["VC数の変更中にエラーが発生しました"]);
	});

	it("作成の途中で失敗しても、作れたボイスチャンネルは以後の変更で扱える", async () => {
		const { room, members } = await world.setupRoom("alice");
		let created = 0;
		world.server.fail(
			(request) =>
				apiRequest("POST", /\/channels$/)(request) &&
				(request.body as { type: ChannelType }).type === ChannelType.GuildVoice &&
				++created > 1,
		);
		await members[0].run("room vc", room.textChannel, { number: 2 });

		await members[0].run("room vc", room.textChannel, { number: 0 });

		expect(room.additionalVoiceChannels).toEqual([]);
	});
});
