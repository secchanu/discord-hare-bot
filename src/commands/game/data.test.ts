import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TIME, TIMEOUT } from "../../constants";
import type { RoleState } from "../../testing/discord/server";
import { createWorld, type Member, type World } from "../../testing/world";

let world: World;

beforeEach(async () => {
	world = await createWorld();
});

afterEach(() => {
	world.dispose();
});

/**
 * ロール「APEX」を持つメンバーを用意し、必要ならそのゲームにデータを保存する
 */
async function setupGame(data?: Record<string, string[]>) {
	const apex = world.addRole("APEX");
	const alice = world.addMember("alice", { roles: [apex] });
	if (data) await world.saveGameData(apex, data);
	return { apex, alice };
}

/**
 * /game data を実行してデータを選び、フォームを開く
 */
async function openForm(member: Member, role: RoleState, key: string) {
	const run = await member.run("game data", world.generalChannel, { game: role });
	const message = run.response;
	await member.select(message, "data_key", [key]);
	return message;
}

describe("実行条件", () => {
	it("@everyone を指定した場合は実行者にだけエラーを返す", async () => {
		const { alice } = await setupGame();

		const run = await alice.run("game data", world.generalChannel, { game: world.everyoneRole });

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このロールはゲームとして選択できません"]);
	});

	it("除外ロールを指定した場合は実行者にだけエラーを返す", async () => {
		const alice = world.addMember("alice", { roles: [world.ignoredRole] });

		const run = await alice.run("game data", world.generalChannel, { game: world.ignoredRole });

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual(["このロールはゲームとして選択できません"]);
	});

	it("持っていないロールを指定した場合は実行者にだけエラーを返す", async () => {
		const apex = world.addRole("APEX");
		const alice = world.addMember("alice");

		const run = await alice.run("game data", world.generalChannel, { game: apex });

		expect(run.publicMessages).toEqual([]);
		expect(run.privateMessages).toEqual([
			"このゲームは付与されていないため選択できません\n先に<id:customize>からプレイするゲームとして選択してください",
		]);
	});
});

describe("編集するデータの選択", () => {
	it("選択肢には、既存のデータと新規作成が並ぶ", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"], キャラ: ["B"] });

		const run = await alice.run("game data", world.generalChannel, { game: apex });

		expect(run.response.selectMenu("data_key")?.map((option) => option.value)).toEqual([
			"マップ",
			"キャラ",
			"新規作成",
		]);
	});

	it("データが24件を超えても、選択肢の最後には新規作成が並ぶ（境界値）", async () => {
		const keys = Array.from({ length: 25 }, (_, i) => `データ${i + 1}`);
		const { apex, alice } = await setupGame(Object.fromEntries(keys.map((key) => [key, ["A"]])));

		const run = await alice.run("game data", world.generalChannel, { game: apex });

		expect(run.response.selectMenu("data_key")?.map((option) => option.value)).toEqual([
			...keys.slice(0, 24),
			"新規作成",
		]);
	});

	it("既存のデータを選ぶと、データ名と項目を入力済みのフォームが開く", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A", "B"] });

		await openForm(alice, apex, "マップ");

		expect(alice.modalFields).toEqual({ key: "マップ", data: "A\nB" });
	});

	it("新規作成を選ぶと、空のフォームが開く", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"] });

		await openForm(alice, apex, "新規作成");

		expect(alice.modalFields).toEqual({ key: "", data: "" });
	});

	it("フォームを開いた後、選択メニューは未選択に戻る", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"] });

		const message = await openForm(alice, apex, "マップ");

		expect(message.selectMenu("data_key")?.filter((option) => option.selected)).toEqual([]);
	});

	it("実行者以外の選択は受け付けず、操作した人にだけ伝える", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"] });
		const run = await alice.run("game data", world.generalChannel, { game: apex });
		const bob = world.addMember("bob", { roles: [apex] });

		const record = await bob.select(run.response, "data_key", ["マップ"]);

		expect(record.privateMessages).toEqual(["この操作はコマンドを実行した人のみ行えます"]);
		expect(bob.modalFields).toBeUndefined();
	});
});

describe("データの保存", () => {
	it("新しいデータ名で送信すると、データを作って作成したことを表示する", async () => {
		const { apex, alice } = await setupGame();
		const message = await openForm(alice, apex, "新規作成");

		await alice.submitModal({ key: "マップ", data: "A\nB" });

		expect(message.content).toBe("APEX: 「マップ」のデータを作成しました\n`A, B`");
		expect(await world.savedGameData(apex)).toEqual({ マップ: ["A", "B"] });
	});

	it("項目は改行で区切り、前後の空白と空行を除いて保存する", async () => {
		const { apex, alice } = await setupGame();
		await openForm(alice, apex, "新規作成");

		await alice.submitModal({ key: "マップ", data: "  A  \n\n B \n" });

		expect(await world.savedGameData(apex)).toEqual({ マップ: ["A", "B"] });
	});

	it("既存のデータを送信すると、更新して更新したことを表示する", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"] });
		const message = await openForm(alice, apex, "マップ");

		await alice.submitModal({ data: "A\nB" });

		expect(message.content).toBe("APEX: 「マップ」のデータを更新しました\n`A, B`");
		expect(await world.savedGameData(apex)).toEqual({ マップ: ["A", "B"] });
	});

	it("データ名を変えて送信すると、古いデータ名を消して名前を変えたことを表示する", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"] });
		const message = await openForm(alice, apex, "マップ");

		await alice.submitModal({ key: "ステージ" });

		expect(message.content).toBe("APEX: 「マップ」のデータを「ステージ」に更新しました\n`A`");
		expect(await world.savedGameData(apex)).toEqual({ ステージ: ["A"] });
	});

	it("項目を空にして送信すると、データを削除して削除したことを表示する", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"], キャラ: ["B"] });
		const message = await openForm(alice, apex, "マップ");

		await alice.submitModal({ data: "\n  \n" });

		expect(message.content).toBe("APEX: 「マップ」のデータを削除しました");
		expect(await world.savedGameData(apex)).toEqual({ キャラ: ["B"] });
	});

	it("データ名が空白だけの場合は保存せず、編集画面を取り下げて実行者にだけ伝える", async () => {
		const { apex, alice } = await setupGame();
		const message = await openForm(alice, apex, "新規作成");

		const record = await alice.submitModal({ key: "  ", data: "A" });

		expect(record.privateMessages).toEqual(["APEX: データ名が入力されていません"]);
		expect(world.message(message.id)).toBeUndefined();
		expect(await world.savedGameData(apex)).toEqual({});
	});

	it("フォームを閉じて別のデータを選び直すと、送信したフォームの内容で保存する", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"], キャラ: ["B"] });
		const message = await openForm(alice, apex, "マップ");
		alice.closeModal();
		await alice.select(message, "data_key", ["キャラ"]);

		await alice.submitModal({ data: "B\nC" });

		expect(await world.savedGameData(apex)).toEqual({ マップ: ["A"], キャラ: ["B", "C"] });
	});

	it("保存したデータは、Botを再起動しても残る", async () => {
		const { apex, alice } = await setupGame();
		await openForm(alice, apex, "新規作成");
		await alice.submitModal({ key: "マップ", data: "A" });

		await world.restartBot();
		await openForm(alice, apex, "マップ");

		expect(alice.modalFields).toEqual({ key: "マップ", data: "A" });
	});
});

describe("無操作の時間", () => {
	it("選択がないまま無操作の時間が過ぎると、「タイムアウトしました」に置き換えてメニューを取り除く", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"] });
		const run = await alice.run("game data", world.generalChannel, { game: apex });

		await world.advance(TIMEOUT.COMPONENT_IDLE);

		expect(run.response.content).toBe("タイムアウトしました");
		expect(run.response.selectMenu("data_key")).toBeUndefined();
	});

	it("無操作の時間を過ぎた後に送信したフォームは保存せず、操作した人にだけ期限切れを伝える", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"] });
		await openForm(alice, apex, "マップ");
		await world.advance(TIMEOUT.COMPONENT_IDLE);

		const record = await alice.submitModal({ data: "B" });
		await world.advance(TIMEOUT.ORPHANED_COMPONENT_GRACE);

		expect(record.privateMessages).toEqual([
			"この操作は期限切れです\nコマンドを再実行してください",
		]);
		expect(await world.savedGameData(apex)).toEqual({ マップ: ["A"] });
	});

	it("フォームを開いてから無操作の時間に満たなければ、送信を保存する", async () => {
		const { apex, alice } = await setupGame({ マップ: ["A"] });
		await openForm(alice, apex, "マップ");
		await world.advance(TIMEOUT.COMPONENT_IDLE - TIME.SECOND);

		await alice.submitModal({ data: "B" });

		expect(await world.savedGameData(apex)).toEqual({ マップ: ["B"] });
	});
});
