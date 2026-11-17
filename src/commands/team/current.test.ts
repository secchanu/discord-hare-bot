import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorld, type MessageView, type World } from "../../testing/world";

let world: World;

beforeEach(async () => {
	world = await createWorld();
});

afterEach(() => {
	world.dispose();
});

/**
 * チーム一覧の表示から、チームごとの行を取り出す
 */
function teamsIn(message: MessageView): string[][] {
	return message.content
		.split("\n\n")
		.filter((block) => block.startsWith("チーム"))
		.map((block) => block.split("\n").slice(1));
}

/**
 * ルームを作り、追加ボイスチャンネルを vcCount 個にして、layout の順に各追加ボイスチャンネルへメンバーを入れる
 * spectators はメインのボイスチャンネルに残る
 */
async function setupVoiceChannels(vcCount: number, layout: string[][], spectators: string[] = []) {
	const { room, members } = await world.setupRoom(...layout.flat(), ...spectators);
	const [owner] = members;
	await owner.run("room vc", room.textChannel, { number: vcCount });
	let next = 0;
	for (const [index, names] of layout.entries()) {
		for (const _ of names) {
			await members[next++].joinVoice(room.additionalVoiceChannels[index]);
		}
	}
	return { room, members, owner };
}

describe("実行条件", () => {
	it("ルーム外から実行した場合は実行者にだけエラーを返す", async () => {
		const { owner } = await setupVoiceChannels(2, [["a"], ["b"]]);

		const run = await owner.run("team current", world.generalChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("メンバーのいる追加ボイスチャンネルが1つだけの場合は実行者にだけエラーを返す（境界値）", async () => {
		const { room, owner } = await setupVoiceChannels(2, [["a", "b"], []]);

		const run = await owner.run("team current", room.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["2つ以上の追加VCにメンバーが分かれている必要があります"]);
	});
});

describe("チーム", () => {
	it("追加ボイスチャンネルの番号をチームの番号にし、メインのボイスチャンネルのメンバーとBotは含めない", async () => {
		const { room, members, owner } = await setupVoiceChannels(2, [["a", "b"], ["c"]], ["s"]);
		await world.addMember("music-bot", { bot: true }).joinVoice(room.additionalVoiceChannels[0]);
		const [a, b, c] = members;

		const run = await owner.run("team current", room.textChannel);

		expect(teamsIn(run.response)).toEqual([[a.mention, b.mention], [c.mention]]);
	});

	it("途中の空の追加ボイスチャンネルは、番号を保つため空のチームとして残す", async () => {
		const { room, members, owner } = await setupVoiceChannels(3, [[], ["a"], ["b"]]);
		const [a, b] = members;

		const run = await owner.run("team current", room.textChannel);

		expect(teamsIn(run.response)).toEqual([["なし"], [a.mention], [b.mention]]);
	});

	it("末尾の空の追加ボイスチャンネルはチームに数えない", async () => {
		const { room, owner } = await setupVoiceChannels(3, [["a"], ["b"], []]);

		const run = await owner.run("team current", room.textChannel);

		expect(teamsIn(run.response)).toHaveLength(2);
	});
});
