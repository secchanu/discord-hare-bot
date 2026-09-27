import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIMEOUT } from "../../constants";
import { createWorld, type World } from "../../testing/world";

let world: World;

beforeEach(async () => {
	world = await createWorld();
});

afterEach(() => {
	world.dispose();
	vi.restoreAllMocks();
});

/**
 * ゲーム「APEX」のルームを作り、そのゲームにデータを保存する
 */
async function setupGameRoom(data: Record<string, string[]>) {
	const apex = world.addRole("APEX");
	const alice = world.addMember("alice", { roles: [apex] });
	const room = await alice.createRoom();
	await alice.run("room game", room.textChannel, { game: apex });
	await world.saveGameData(apex, data);
	return { apex, alice, room };
}

/**
 * /rand data を実行してデータを選び、抽選結果のメッセージを返す
 */
async function drawFrom(data: Record<string, string[]>, key: string) {
	const { alice, room } = await setupGameRoom(data);
	const run = await alice.run("rand data", room.textChannel);
	const message = run.response;
	await alice.select(message, "data_key", [key]);
	return { alice, room, message };
}

describe("実行条件", () => {
	it("ルーム外から実行した場合は実行者にだけエラーを返す", async () => {
		const { alice } = await setupGameRoom({ マップ: ["A"] });

		const run = await alice.run("rand data", world.generalChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このコマンドはルーム内でのみ使用できます"]);
	});

	it("ルームのゲームにデータがない場合は、現在のゲーム名とともに実行者にだけ伝える", async () => {
		const { alice, room } = await setupGameRoom({});

		const run = await alice.run("rand data", room.textChannel);

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual([
			"抽選できるデータがありません\n部屋のゲームを確認してください\n現在のゲームは「APEX」です",
		]);
	});
});

describe("データの選択", () => {
	it("選択肢には、ルームのゲームの最新のデータが並ぶ", async () => {
		const { alice, room } = await setupGameRoom({ マップ: ["A"], キャラ: ["B"] });

		const run = await alice.run("rand data", room.textChannel);

		expect(run.response.selectMenu("data_key")?.map((option) => option.value)).toEqual([
			"マップ",
			"キャラ",
		]);
	});

	it("データが25件を超える場合、選択肢には先頭の25件が並ぶ（境界値）", async () => {
		const keys = Array.from({ length: 26 }, (_, i) => `データ${i + 1}`);
		const { alice, room } = await setupGameRoom(
			Object.fromEntries(keys.map((key) => [key, ["A"]])),
		);

		const run = await alice.run("rand data", room.textChannel);

		expect(run.response.selectMenu("data_key")?.map((option) => option.value)).toEqual(
			keys.slice(0, 25),
		);
	});

	it("データを選ぶと、そのデータの項目のいずれかを表示する", async () => {
		const { message } = await drawFrom({ マップ: ["A", "B", "C"], キャラ: ["X"] }, "マップ");

		expect(["A", "B", "C"]).toContain(message.content);
	});

	it("実行者以外の選択は受け付けず、操作した人にだけ伝える", async () => {
		const { alice, room } = await setupGameRoom({ マップ: ["A"] });
		const run = await alice.run("rand data", room.textChannel);
		const bob = world.addMember("bob");

		const record = await bob.select(run.response, "data_key", ["マップ"]);

		expect(record.privateMessages).toEqual(["この操作はコマンドを実行した人のみ行えます"]);
		expect(run.response.content).toBe("抽選するデータを選択してください");
	});

	it("選択がないまま無操作の時間が過ぎると、「タイムアウトしました」に置き換えてメニューを取り除く", async () => {
		const { alice, room } = await setupGameRoom({ マップ: ["A"] });
		const run = await alice.run("rand data", room.textChannel);

		await world.advance(TIMEOUT.COMPONENT_IDLE);

		expect(run.response.content).toBe("タイムアウトしました");
		expect(run.response.selectMenu("data_key")).toBeUndefined();
	});
});

describe("抽選結果の操作", () => {
	it("再抽選すると項目を選び直す", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		const { alice, message } = await drawFrom({ マップ: ["A", "B", "C"] }, "マップ");

		vi.spyOn(Math, "random").mockReturnValue(0.99);
		await alice.click(message, "reroll");

		expect(message.content).toBe("C");
	});

	it("確定すると、結果を残して操作を取り除く", async () => {
		const { alice, message } = await drawFrom({ マップ: ["A"] }, "マップ");

		await alice.click(message, "confirm");

		expect(message.content).toBe("A");
		expect(message.buttons).toEqual([]);
	});

	it("キャンセルするとメッセージを削除する", async () => {
		const { alice, message } = await drawFrom({ マップ: ["A"] }, "マップ");

		await alice.click(message, "cancel");

		expect(world.message(message.id)).toBeUndefined();
	});

	it("無操作の時間が過ぎると、結果を残して操作を取り除く", async () => {
		const { message } = await drawFrom({ マップ: ["A"] }, "マップ");

		await world.advance(TIMEOUT.COMPONENT_IDLE);

		expect(message.content).toBe("A");
		expect(message.buttons).toEqual([]);
	});
});
