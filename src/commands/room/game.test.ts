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
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		await alice.createRoom();

		const run = await alice.run("room game", world.generalChannel, { game: apex });

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("除外ロールを指定した場合は実行者にだけエラーを返す", async () => {
		const alice = world.addMember("alice", { roles: [world.ignoredRole] });
		const room = await alice.createRoom();

		const run = await alice.run("room game", room.textChannel, { game: world.ignoredRole });

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このロールはゲームとして選択できません"]);
	});

	it("持っていないロールを指定した場合は実行者にだけエラーを返す", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice");
		const room = await alice.createRoom();

		const run = await alice.run("room game", room.textChannel, { game: apex });

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual([
			"このゲームは付与されていないため選択できません\n先に<id:customize>からプレイするゲームとして選択してください",
		]);
	});
});

describe("ゲームの変更", () => {
	it("自分のロールを指定すると、ルームのゲームとボイスチャンネル名が変わる", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		const room = await alice.createRoom();

		const run = await alice.run("room game", room.textChannel, { game: apex });

		expect(run.publicMessages).toEqual(["ゲームを「APEX」に変更しました"]);
		expect(room.voiceChannel.name).toBe("APEX");
	});

	it("@everyone を指定すると、デフォルトのゲームに戻る", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice", { roles: [apex] });
		const room = await alice.createRoom();
		await alice.run("room game", room.textChannel, { game: apex });

		const run = await alice.run("room game", room.textChannel, { game: world.everyoneRole });

		expect(run.publicMessages).toEqual(["ゲームを「Free」に変更しました"]);
		expect(room.voiceChannel.name).toBe("Free");
	});

	it("ボイスチャンネルに入っていなくても、ルームのチャンネルから変更できる", async () => {
		const apex = world.addRole("APEX");
		const { room } = await world.setupRoom("alice");
		const bob = world.addMember("bob", { roles: [apex] });

		await bob.run("room game", room.textChannel, { game: apex });

		expect(room.voiceChannel.name).toBe("APEX");
	});
});
