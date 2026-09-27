import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIMEOUT } from "../constants";
import { apiRequest } from "../testing/discord/server";
import { createWorld, type Member, type MessageView, type World } from "../testing/world";

let world: World;

beforeEach(async () => {
	world = await createWorld();
});

afterEach(() => {
	world.dispose();
	vi.restoreAllMocks();
});

/**
 * チーム一覧の表示から、チームごとのメンションを取り出す
 */
function teamsIn(message: MessageView): string[][] {
	return message.content
		.split("\n\n")
		.filter((block) => block.startsWith("チーム"))
		.map((block) => block.split("\n").slice(1));
}

/**
 * チーム一覧の表示から、除外されたメンバーのメンションを取り出す
 */
function excludedIn(message: MessageView): string[] {
	const line = message.content.split("\n").find((text) => text.startsWith("除外: "));
	return line ? line.slice("除外: ".length).split(" ") : [];
}

/**
 * ルームで /team を実行し、チーム分けの表示を返す
 */
async function startTeam(names: string[], options: { number?: number } = {}) {
	const { room, members } = await world.setupRoom(...names);
	const [owner] = members;
	const run = await owner.run("team", room.textChannel, options);
	return { room, members, owner, message: run.response };
}

describe("実行条件", () => {
	it("ルーム外から実行した場合は実行者にだけエラーを返す", async () => {
		const { members } = await world.setupRoom("alice", "bob");

		const run = await members[0].run("team", world.generalChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("入っているボイスチャンネルとは別のルームから実行した場合は実行者にだけエラーを返す", async () => {
		const { members } = await world.setupRoom("alice", "bob");
		const other = await world.addMember("carol").createRoom();

		const run = await members[0].run("team", other.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("ボイスチャンネルに入っていない場合は実行者にだけエラーを返す", async () => {
		const { room } = await world.setupRoom("alice", "bob");

		const run = await world.addMember("carol").run("team", room.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("ボイスチャンネルにBot以外が1人しかいない場合は実行者にだけエラーを返す", async () => {
		const { room, members } = await world.setupRoom("alice");
		await world.addMember("music-bot", { bot: true }).joinVoice(room.voiceChannel);

		const run = await members[0].run("team", room.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["チーム分けには2人以上のメンバーが必要です"]);
	});
});

describe("チーム分け", () => {
	it("Bot以外の全員がいずれかのチームに入り、チームの人数差は1人以内になる", async () => {
		const { room, members } = await world.setupRoom("a", "b", "c", "d", "e");
		await world.addMember("music-bot", { bot: true }).joinVoice(room.voiceChannel);

		const run = await members[0].run("team", room.textChannel);

		const teams = teamsIn(run.response);
		expect(teams.flat().sort()).toEqual(members.map((member) => member.mention).sort());
		const sizes = teams.map((team) => team.length);
		expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
	});

	it("チーム数を指定しない場合は2チームに分ける", async () => {
		const { message } = await startTeam(["a", "b", "c", "d"]);

		expect(teamsIn(message)).toHaveLength(2);
	});

	it("チーム数に1以下は指定できない（境界値）", async () => {
		const { room, members } = await world.setupRoom("a", "b");

		await expect(members[0].run("team", room.textChannel, { number: 1 })).rejects.toThrow(
			RangeError,
		);
	});

	it("指定したチーム数に分ける", async () => {
		const { message } = await startTeam(["a", "b", "c", "d", "e", "f"], { number: 3 });

		expect(teamsIn(message)).toHaveLength(3);
	});

	it("メンバー数より多いチーム数を指定した場合は、メンバー数のチームに分ける（境界値）", async () => {
		const { message } = await startTeam(["a", "b", "c"], { number: 4 });

		expect(teamsIn(message)).toHaveLength(3);
	});

	it("除外メニューには、ボイスチャンネルのBot以外の全員が未選択で並ぶ", async () => {
		const { room, members } = await world.setupRoom("a", "b", "c");
		await world.addMember("music-bot", { bot: true }).joinVoice(room.voiceChannel);

		const { response: message } = await members[0].run("team", room.textChannel);

		expect(message.selectMenu("exclude")).toEqual(
			members.map((member) => ({ label: member.name, value: member.id, selected: false })),
		);
	});

	it("メンバーが25人を超える場合、除外メニューには先頭の25人だけが並ぶ（境界値）", async () => {
		const names = Array.from({ length: 26 }, (_, i) => `member${i + 1}`);

		const { members, message } = await startTeam(names);

		expect(message.selectMenu("exclude")?.map((option) => option.value)).toEqual(
			members.slice(0, 25).map((member) => member.id),
		);
	});
});

describe("除外", () => {
	it("選んだメンバーをチームから外し、除外として表示する", async () => {
		const { owner, members, message } = await startTeam(["a", "b", "c", "d"]);
		const [, b, c] = members;

		await owner.select(message, "exclude", [b.id, c.id]);

		expect(teamsIn(message).flat()).not.toContain(b.mention);
		expect(teamsIn(message).flat()).not.toContain(c.mention);
		expect(excludedIn(message)).toEqual([b.mention, c.mention]);
	});

	it("除外したメンバーだけが除外メニューで選択済みになる", async () => {
		const { owner, members, message } = await startTeam(["a", "b", "c"]);
		const [, b] = members;

		await owner.select(message, "exclude", [b.id]);

		expect(
			message
				.selectMenu("exclude")
				?.filter((option) => option.selected)
				.map((option) => option.value),
		).toEqual([b.id]);
	});

	it("再抽選しても除外は維持する", async () => {
		const { owner, members, message } = await startTeam(["a", "b", "c", "d"]);
		const [, b] = members;
		await owner.select(message, "exclude", [b.id]);

		await owner.click(message, "reroll");

		expect(teamsIn(message).flat()).not.toContain(b.mention);
		expect(excludedIn(message)).toEqual([b.mention]);
	});

	it("残りが2人未満になる選択は受け付けず、操作した人にだけエラーを返す", async () => {
		const { owner, members, message } = await startTeam(["a", "b", "c"]);
		const before = message.content;

		const record = await owner.select(message, "exclude", [members[1].id, members[2].id]);

		expect(record.privateMessages).toEqual(["チーム分けには2人以上のメンバーが必要です"]);
		expect(message.content).toBe(before);
	});
});

describe("再抽選・キャンセル", () => {
	it("再抽選するとチームを分け直す", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		const { owner, message } = await startTeam(["a", "b", "c", "d"]);
		const before = teamsIn(message);

		vi.spyOn(Math, "random").mockReturnValue(0.99);
		await owner.click(message, "reroll");

		expect(teamsIn(message)).not.toEqual(before);
		expect(teamsIn(message).flat().sort()).toEqual(before.flat().sort());
	});

	it("キャンセルするとチーム分けのメッセージを削除する", async () => {
		const { owner, message } = await startTeam(["a", "b"]);

		await owner.click(message, "cancel");

		expect(world.message(message.id)).toBeUndefined();
	});
});

describe("確定と移動", () => {
	/**
	 * 各メンバーが入っているボイスチャンネルの名前
	 */
	function voiceChannelNamesOf(members: Member[]): Record<string, string | undefined> {
		return Object.fromEntries(
			members.map((member) => [
				member.mention,
				member.voiceChannelId && world.channel(member.voiceChannelId)?.name,
			]),
		);
	}

	it("確定すると、チーム一覧を残して操作は移動ボタンだけになる", async () => {
		const { owner, message } = await startTeam(["a", "b"]);
		const teams = teamsIn(message);

		await owner.click(message, "confirm");

		expect(teamsIn(message)).toEqual(teams);
		expect(message.buttons).toEqual(["move"]);
		expect(message.selectMenu("exclude")).toBeUndefined();
	});

	it("移動すると、チームごとに追加ボイスチャンネルへ分かれる", async () => {
		const { owner, members, message } = await startTeam(["a", "b", "c", "d"]);
		await owner.click(message, "confirm");

		await owner.click(message, "move");

		const expected = Object.fromEntries(
			teamsIn(message).flatMap((team, index) =>
				team.map((mention) => [mention, `VC [${index + 1}]`]),
			),
		);
		expect(voiceChannelNamesOf(members)).toEqual(expected);
	});

	it("追加ボイスチャンネルがチーム数より多くても、減らさない", async () => {
		const { room, owner, message } = await startTeam(["a", "b"]);
		await owner.run("room vc", room.textChannel, { number: 3 });
		await owner.click(message, "confirm");

		await owner.click(message, "move");

		expect(room.additionalVoiceChannels.map((channel) => channel.name)).toEqual([
			"VC [1]",
			"VC [2]",
			"VC [3]",
		]);
	});

	it("移動した後も移動ボタンが残り、集合した後に同じチームで再び移動できる", async () => {
		const { room, owner, members, message } = await startTeam(["a", "b", "c", "d"]);
		await owner.click(message, "confirm");
		await owner.click(message, "move");
		const firstMove = voiceChannelNamesOf(members);
		await owner.run("call", room.voiceChannel);

		await owner.click(message, "move");

		expect(message.buttons).toEqual(["move"]);
		expect(voiceChannelNamesOf(members)).toEqual(firstMove);
	});

	it("確定後は、無操作の時間を過ぎても移動できる", async () => {
		const { owner, members, message } = await startTeam(["a", "b"]);
		await owner.click(message, "confirm");

		await world.advance(TIMEOUT.COMPONENT_IDLE + 1);
		await owner.click(message, "move");

		expect(Object.values(voiceChannelNamesOf(members)).sort()).toEqual(["VC [1]", "VC [2]"]);
	});

	it("移動できなかったメンバーがいる場合は、移動ボタンを残して操作した人にだけ伝える", async () => {
		const { owner, members, message } = await startTeam(["a", "b"]);
		await owner.click(message, "confirm");
		world.server.fail(apiRequest("PATCH", new RegExp(`/members/${members[1].id}$`)));

		const record = await owner.click(message, "move");

		expect(record.privateMessages).toEqual(["移動できなかったメンバーがいます"]);
		expect(message.buttons).toEqual(["move"]);
	});
});

describe("操作の受付", () => {
	it("実行者以外の操作は受け付けず、操作した人にだけ伝える", async () => {
		const { members, message } = await startTeam(["a", "b"]);
		const before = message.content;

		const record = await members[1].click(message, "reroll");

		expect(record.privateMessages).toEqual(["この操作はコマンドを実行した人のみ行えます"]);
		expect(message.content).toBe(before);
	});

	it("確定前に無操作の時間が過ぎると、チーム一覧を残して操作を取り除く", async () => {
		const { message } = await startTeam(["a", "b"]);
		const teams = teamsIn(message);

		await world.advance(TIMEOUT.COMPONENT_IDLE);

		expect(teamsIn(message)).toEqual(teams);
		expect(message.buttons).toEqual([]);
		expect(message.selectMenu("exclude")).toBeUndefined();
	});

	it("無操作の時間は最後の操作から数える", async () => {
		const { owner, message } = await startTeam(["a", "b"]);

		await world.advance(TIMEOUT.COMPONENT_IDLE - 1);
		await owner.click(message, "reroll");
		await world.advance(TIMEOUT.COMPONENT_IDLE - 1);

		expect(message.buttons).toEqual(["cancel", "confirm", "reroll"]);
	});
});
