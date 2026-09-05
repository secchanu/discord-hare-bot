import type { ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../../bot/context";
import { handleData } from "./data";

vi.mock("../../types/guards", () => ({
	hasRoleManager: vi.fn().mockReturnValue(true),
}));

const mockGameManager = {
	getGame: vi.fn(),
	createGame: vi.fn(),
	updateGameData: vi.fn(),
};

const mockCtx = {
	gameManager: mockGameManager,
	config: {
		ignoreRoleIds: ["ignore-role-id"],
	},
} as unknown as AppContext;

const EVERYONE_ROLE_ID = "everyone-role-id";

function makeModalInteraction(
	overrides: {
		key?: string;
		data?: string;
		userId?: string;
		customId?: string;
	} = {},
) {
	return {
		deferUpdate: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
		fields: {
			getTextInputValue: vi.fn().mockImplementation((field: string) => {
				if (field === "key") return overrides.key ?? "newKey";
				if (field === "data") return overrides.data ?? "item1\nitem2";
				return "";
			}),
		},
		user: { id: overrides.userId ?? "user-id" },
		customId: overrides.customId ?? "game_data_msg-id",
	};
}

function makeSelectInteraction(key: string, id: string = "select-id") {
	const modalInteraction = makeModalInteraction({ customId: `game_data_${id}` });
	return {
		id,
		values: [key],
		showModal: vi.fn().mockResolvedValue(undefined),
		awaitModalSubmit: vi.fn().mockResolvedValue(modalInteraction),
		_modalInteraction: modalInteraction,
	};
}

/**
 * セレクトメニューのコレクターを模したメッセージを生成する
 * 渡した選択を順に collect し、送信で止まらなければ無操作タイムアウトで終了する
 */
function makeMessage(selectInteractions: Array<ReturnType<typeof makeSelectInteraction>>) {
	const handlers: Record<string, (...args: never[]) => Promise<void>> = {};
	const collector = {
		ended: false,
		on: vi.fn((event: string, handler: (...args: never[]) => Promise<void>) => {
			handlers[event] = handler;
			if (event === "end") void run();
		}),
		stop: vi.fn((reason: string) => {
			if (collector.ended) return;
			collector.ended = true;
			void handlers.end?.(...([undefined, reason] as never[]));
		}),
	};
	async function run() {
		for (const selectInteraction of selectInteractions) {
			if (collector.ended) return;
			await handlers.collect?.(selectInteraction as never);
		}
		collector.stop("idle");
	}
	return {
		id: "msg-id",
		createMessageComponentCollector: vi.fn().mockReturnValue(collector),
		edit: vi.fn().mockResolvedValue(undefined),
	};
}

function makeInteraction(
	overrides: {
		roleId?: string;
		hasRole?: boolean;
		inCachedGuild?: boolean;
		message?: ReturnType<typeof makeMessage>;
	} = {},
) {
	const { roleId = "game-role-id", hasRole = true, inCachedGuild = true, message } = overrides;

	const msg = message ?? makeMessage([makeSelectInteraction("新規作成")]);

	return {
		inCachedGuild: vi.fn().mockReturnValue(inCachedGuild),
		channel: { id: "text-channel-id" },
		guild: {
			id: "guild-id",
			roles: {
				everyone: { id: EVERYONE_ROLE_ID },
			},
		},
		member: {
			roles: {
				cache: {
					has: vi.fn().mockReturnValue(hasRole),
				},
			},
		},
		options: {
			getRole: vi.fn().mockReturnValue({ id: roleId, name: "ゲームA" }),
		},
		user: { id: "user-id" },
		reply: vi.fn().mockResolvedValue(undefined),
		deferReply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockImplementation(async () => msg),
		deleteReply: vi.fn().mockResolvedValue(undefined),
	} as unknown as ChatInputCommandInteraction;
}

describe("/game data", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGameManager.updateGameData.mockResolvedValue(undefined);
	});

	describe("ロールの検証", () => {
		it("@everyone ロールは「選択できません」を返す", async () => {
			const interaction = makeInteraction({ roleId: EVERYONE_ROLE_ID });
			mockGameManager.getGame.mockResolvedValue(null);
			await handleData(interaction, mockCtx);
			expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("選択できません"));
			expect(mockGameManager.getGame).not.toHaveBeenCalled();
		});

		it("ignoreRoleIds に含まれるロールは「選択できません」を返す", async () => {
			const interaction = makeInteraction({ roleId: "ignore-role-id" });
			await handleData(interaction, mockCtx);
			expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("選択できません"));
			expect(mockGameManager.getGame).not.toHaveBeenCalled();
		});

		it("メンバーがロールを持っていない場合は「付与されていない」を返す", async () => {
			const interaction = makeInteraction({ hasRole: false });
			await handleData(interaction, mockCtx);
			expect(interaction.editReply).toHaveBeenCalledWith(
				expect.stringContaining("付与されていない"),
			);
			expect(mockGameManager.getGame).not.toHaveBeenCalled();
		});

		it("ギルド外から実行した場合はエラーを返す", async () => {
			const interaction = makeInteraction({ inCachedGuild: false });
			await handleData(interaction, mockCtx);
			expect(interaction.reply).toHaveBeenCalledWith(
				expect.objectContaining({ content: expect.stringContaining("サーバー内でのみ") }),
			);
		});
	});

	describe("モーダル入力の保存", () => {
		beforeEach(() => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: {},
			});
			mockGameManager.createGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: {},
			});
		});

		it("モーダルのデータ文字列を改行で分割し、trim・空行フィルタをかける", async () => {
			const selectInteraction = makeSelectInteraction("新規作成");
			selectInteraction.awaitModalSubmit.mockResolvedValue(
				makeModalInteraction({ key: "マップ", data: "  マップA  \n\n  マップB  \n" }),
			);
			const message = makeMessage([selectInteraction]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(mockGameManager.updateGameData).toHaveBeenCalledWith("game-role-id", "マップ", [
				"マップA",
				"マップB",
			]);
		});

		it("データが空（空行のみ）の場合はキーを削除する", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { マップ: ["マップA"] },
			});
			const selectInteraction = makeSelectInteraction("マップ");
			selectInteraction.awaitModalSubmit.mockResolvedValue(
				makeModalInteraction({ key: "マップ", data: "\n\n" }),
			);
			const message = makeMessage([selectInteraction]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(mockGameManager.updateGameData).toHaveBeenCalledWith("game-role-id", "マップ", null);
		});

		it("キー名変更時: 旧キーを削除し、新キーで作成する", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { 旧キー: ["item1"] },
			});
			const selectInteraction = makeSelectInteraction("旧キー");
			selectInteraction.awaitModalSubmit.mockResolvedValue(
				makeModalInteraction({ key: "新キー", data: "item1\nitem2" }),
			);
			const message = makeMessage([selectInteraction]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(mockGameManager.updateGameData).toHaveBeenCalledWith("game-role-id", "旧キー", null);
			expect(mockGameManager.updateGameData).toHaveBeenCalledWith("game-role-id", "新キー", [
				"item1",
				"item2",
			]);
		});
	});

	describe("操作結果の表示", () => {
		beforeEach(() => {
			mockGameManager.createGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: {},
			});
		});

		it("データを空にして送信した場合は削除したことを表示する", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { マップ: ["マップA"] },
			});
			const selectInteraction = makeSelectInteraction("マップ");
			const modalInteraction = makeModalInteraction({ key: "マップ", data: "" });
			selectInteraction.awaitModalSubmit.mockResolvedValue(modalInteraction);
			const message = makeMessage([selectInteraction]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(modalInteraction.editReply).toHaveBeenLastCalledWith(
				expect.objectContaining({ content: expect.stringContaining("削除しました") }),
			);
		});

		it("データ名を変えて送信した場合は変更前後のデータ名を表示する", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { 旧キー: ["item1"] },
			});
			const selectInteraction = makeSelectInteraction("旧キー");
			const modalInteraction = makeModalInteraction({ key: "新キー", data: "item1\nitem2" });
			selectInteraction.awaitModalSubmit.mockResolvedValue(modalInteraction);
			const message = makeMessage([selectInteraction]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(modalInteraction.editReply).toHaveBeenLastCalledWith(
				expect.objectContaining({
					content: expect.stringMatching(/「旧キー」.*「新キー」.*更新しました/),
				}),
			);
		});

		it("既存のデータを送信した場合は更新したことを表示する", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { マップ: ["マップA"] },
			});
			const selectInteraction = makeSelectInteraction("マップ");
			const modalInteraction = makeModalInteraction({ key: "マップ", data: "マップA\nマップB" });
			selectInteraction.awaitModalSubmit.mockResolvedValue(modalInteraction);
			const message = makeMessage([selectInteraction]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(modalInteraction.editReply).toHaveBeenLastCalledWith(
				expect.objectContaining({ content: expect.stringContaining("更新しました") }),
			);
		});

		it("新規作成を送信した場合は作成したことを表示する", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: {},
			});
			const selectInteraction = makeSelectInteraction("新規作成");
			const modalInteraction = makeModalInteraction({ key: "新データ", data: "item1\nitem2" });
			selectInteraction.awaitModalSubmit.mockResolvedValue(modalInteraction);
			const message = makeMessage([selectInteraction]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(modalInteraction.editReply).toHaveBeenLastCalledWith(
				expect.objectContaining({ content: expect.stringContaining("作成しました") }),
			);
		});

		it("ゲームが存在しない場合は新規作成してから処理を続行する", async () => {
			mockGameManager.getGame.mockResolvedValue(null);
			mockGameManager.createGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: {},
			});
			const selectInteraction = makeSelectInteraction("新規作成");
			selectInteraction.awaitModalSubmit.mockResolvedValue(
				makeModalInteraction({ key: "新データ", data: "item1" }),
			);
			const message = makeMessage([selectInteraction]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(mockGameManager.createGame).toHaveBeenCalled();
			expect(mockGameManager.updateGameData).toHaveBeenCalled();
		});

		it("モーダルがタイムアウトした場合は処理を終了する", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: {},
			});
			const selectInteraction = makeSelectInteraction("新規作成");
			selectInteraction.awaitModalSubmit.mockResolvedValue(null);
			const message = makeMessage([selectInteraction]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(mockGameManager.updateGameData).not.toHaveBeenCalled();
		});

		it("モーダル表示後はセレクトメニューを未選択の状態で描き直す", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: {},
			});
			const selectInteraction = makeSelectInteraction("新規作成");
			selectInteraction.awaitModalSubmit.mockResolvedValue(null);
			const message = makeMessage([selectInteraction]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			const editArgs = message.edit.mock.calls[0][0] as {
				components: Array<{
					components: Array<{
						data: { custom_id: string };
						options: Array<{ data: { default?: boolean } }>;
					}>;
				}>;
			};
			const select = editArgs.components[0].components[0];
			expect(select.data.custom_id).toBe("data_key");
			expect(select.options.some((o) => o.data.default === true)).toBe(false);
		});

		it("モーダルをキャンセルして選び直した場合、送信されたモーダルの内容で保存する", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { マップ: ["マップA"], キャラ: ["キャラA"] },
			});
			const cancelled = makeSelectInteraction("マップ", "select-1");
			cancelled.awaitModalSubmit.mockResolvedValue(null);
			const reselected = makeSelectInteraction("キャラ", "select-2");
			reselected.awaitModalSubmit.mockResolvedValue(
				makeModalInteraction({ key: "キャラ", data: "キャラA\nキャラB" }),
			);
			const message = makeMessage([cancelled, reselected]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(reselected.showModal).toHaveBeenCalledOnce();
			expect(mockGameManager.updateGameData).toHaveBeenCalledWith("game-role-id", "キャラ", [
				"キャラA",
				"キャラB",
			]);
			expect(mockGameManager.updateGameData).not.toHaveBeenCalledWith(
				"game-role-id",
				"マップ",
				expect.anything(),
			);
		});

		it("選択がないまま無操作時間が過ぎた場合はタイムアウトを表示してメニューを取り除く", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: {},
			});
			const message = makeMessage([]);
			const interaction = makeInteraction({ message });

			await handleData(interaction, mockCtx);

			expect(message.edit).toHaveBeenLastCalledWith({
				content: expect.stringContaining("タイムアウト"),
				components: [],
			});
		});
	});
});
