import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiRequest } from "../../testing/discord/server";
import { createWorld, type Member, type MessageView, type World } from "../../testing/world";

let world: World;

beforeEach(async () => {
	world = await createWorld();
});

afterEach(() => {
	world.dispose();
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
 * メンバーが入っているボイスチャンネルの名前
 */
function voiceChannelNameOf(member: Member): string | undefined {
	return member.voiceChannelId && world.channel(member.voiceChannelId)?.name;
}

/**
 * 各追加ボイスチャンネルにチームを入れ、/team current でチームを決めた状態を作る
 * spectators はメインのボイスチャンネルに残る
 */
async function startSession(layout: string[][], spectators: string[] = []) {
	const { room, members } = await world.setupRoom(...layout.flat(), ...spectators);
	const [owner] = members;
	await owner.run("room vc", room.textChannel, { number: layout.length });
	const teams: Member[][] = [];
	let next = 0;
	for (const [index, names] of layout.entries()) {
		const team = members.slice(next, next + names.length);
		for (const member of team) await member.joinVoice(room.additionalVoiceChannels[index]);
		teams.push(team);
		next += names.length;
	}
	const run = await owner.run("team current", room.textChannel);
	return { room, members, owner, teams, message: run.response };
}

describe("チーム移動", () => {
	it("集合した後にチーム移動すると、各チームが番号の同じ追加ボイスチャンネルへ戻る", async () => {
		const { room, owner, teams, message } = await startSession([
			["a", "b"],
			["c", "d"],
		]);
		await owner.run("call", room.textChannel);

		await owner.click(message, "move");

		expect(teams.map((team) => team.map(voiceChannelNameOf))).toEqual([
			["VC [1]", "VC [1]"],
			["VC [2]", "VC [2]"],
		]);
	});

	it("ルームのボイスチャンネルにいないメンバーは動かさず、移動できなかったとも伝えない", async () => {
		const { room, owner, teams, message } = await startSession([["a", "b"], ["c"]]);
		const [[, b], [c]] = teams;
		const other = await world.setupRoom("x");
		await owner.run("call", room.textChannel);
		await b.leaveVoice();
		await c.joinVoice(other.room.voiceChannel);

		const record = await owner.click(message, "move");

		expect(record.privateMessages).toEqual([]);
		expect([voiceChannelNameOf(owner), voiceChannelNameOf(b), voiceChannelNameOf(c)]).toEqual([
			"VC [1]",
			undefined,
			other.room.voiceChannel.name,
		]);
	});

	it("移動できなかったメンバーがいる場合は、ボタンを残して操作した人にだけ伝える", async () => {
		const { room, owner, teams, message } = await startSession([["a"], ["b"]]);
		await owner.run("call", room.textChannel);
		world.server.fail(apiRequest("PATCH", new RegExp(`/members/${teams[1][0].id}$`)));

		const record = await owner.click(message, "move");

		expect(record.privateMessages).toEqual(["移動できなかったメンバーがいます"]);
		expect(message.buttons).toEqual(["move", "gather", "swap"]);
	});
});

describe("全員集合", () => {
	it("観戦しているメンバーも含め、ルームの全員がメインのボイスチャンネルに集まる", async () => {
		const { room, members, owner, message } = await startSession([["a"], ["b"]], ["s"]);

		await owner.click(message, "gather");

		expect(members.map(voiceChannelNameOf)).toEqual(members.map(() => room.voiceChannel.name));
	});
});

describe("サイド交代", () => {
	it("チーム1とチーム2を入れ替えて表示し、メンバーは移動しない", async () => {
		const { owner, teams, message } = await startSession([["a"], ["b"]]);
		const [[a], [b]] = teams;

		await owner.click(message, "swap");

		expect(teamsIn(message)).toEqual([[b.mention], [a.mention]]);
		expect([voiceChannelNameOf(a), voiceChannelNameOf(b)]).toEqual(["VC [1]", "VC [2]"]);
	});

	it("サイド交代の後のチーム移動は、入れ替えた後のチームで移動する", async () => {
		const { owner, teams, message } = await startSession([["a"], ["b"]]);
		const [[a], [b]] = teams;
		await owner.click(message, "swap");

		await owner.click(message, "move");

		expect([voiceChannelNameOf(a), voiceChannelNameOf(b)]).toEqual(["VC [2]", "VC [1]"]);
	});

	it("3チーム以上の場合はサイド交代のボタンを置かない", async () => {
		const { message } = await startSession([["a"], ["b"], ["c"]]);

		expect(message.buttons).toEqual(["move", "gather"]);
	});
});

describe("操作の受付", () => {
	it("実行者以外の操作は受け付けず、操作した人にだけ伝える", async () => {
		const { members, message } = await startSession([["a"], ["b"]]);
		const before = members.map(voiceChannelNameOf);

		const record = await members[1].click(message, "swap");

		expect(record.privateMessages).toEqual(["この操作はコマンドを実行した人のみ行えます"]);
		expect(members.map(voiceChannelNameOf)).toEqual(before);
	});
});

describe("最新のチーム分け", () => {
	it("新しくチームを決めると、前のチーム分けのボタンを取り除く", async () => {
		const { room, owner, message } = await startSession([["a"], ["b"]]);

		const next = await owner.run("team current", room.textChannel);

		expect(message.buttons).toEqual([]);
		expect(next.response.buttons).toEqual(["move", "gather", "swap"]);
	});

	it("抽選を確定するまでは、前のチーム分けのボタンを残す", async () => {
		const { room, owner, message } = await startSession([["a"], ["b"]]);
		await owner.run("call", room.textChannel);

		const draw = await owner.run("team random", room.textChannel);

		expect(draw.response.buttons).toEqual(["cancel", "confirm", "reroll"]);
		expect(message.buttons).toEqual(["move", "gather", "swap"]);
	});

	it("抽選を確定すると、前のチーム分けのボタンを取り除く", async () => {
		const { room, owner, message } = await startSession([["a"], ["b"]]);
		await owner.run("call", room.textChannel);
		const draw = await owner.run("team random", room.textChannel);

		await owner.click(draw.response, "confirm");

		expect(message.buttons).toEqual([]);
	});

	it("別のルームでチームを決めても、このルームのチーム分けのボタンは残る", async () => {
		const { message } = await startSession([["a"], ["b"]]);
		const other = await world.setupRoom("x", "y");

		const draw = await other.members[0].run("team random", other.room.textChannel);
		await other.members[0].click(draw.response, "confirm");

		expect(message.buttons).toEqual(["move", "gather", "swap"]);
	});
});
