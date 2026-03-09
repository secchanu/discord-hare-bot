import type { ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../bot/config";
import { GameManager } from "../../features/games/GameManager";
import { handleData } from "./data";

vi.mock("../../bot/config", () => ({
	config: {
		ignoreRoleIds: ["ignore-role-id"],
		ignoreRoles: [{ id: "ignore-role-id", note: "テスト用無視ロール" }],
	},
}));

vi.mock("../../types/guards", () => ({
	hasRoleManager: vi.fn().mockReturnValue(true),
	hasVoiceState: vi.fn().mockReturnValue(true),
}));

vi.mock("../../features/games/GameManager", () => ({
	GameManager: {
		getInstance: vi.fn(),
	},
}));

const mockGameManager = {
	getGame: vi.fn(),
	createGame: vi.fn(),
	updateGameData: vi.fn(),
};

const EVERYONE_ROLE_ID = "everyone-role-id";

function makeModalInteraction(overrides: {
	key?: string;
	data?: string;
	userId?: string;
	customId?: string;
} = {}) {
	return {
		deferUpdate: vi.fn().mockResolvedValue(undefined),
		fields: {
			getTextInputValue: vi
				.fn()
				.mockImplementation((field: string) => {
					if (field === "key") return overrides.key ?? "newKey";
					if (field === "data") return overrides.data ?? "item1\nitem2";
					return "";
				}),
		},
		user: { id: overrides.userId ?? "user-id" },
		customId: overrides.customId ?? "game_data_msg-id",
	};
}

function makeSelectInteraction(key: string, messageId: string = "msg-id") {
	const modalInteraction = makeModalInteraction({ customId: `game_data_${messageId}` });
	return {
		values: [key],
		showModal: vi.fn().mockResolvedValue(undefined),
		awaitModalSubmit: vi.fn().mockResolvedValue(modalInteraction),
		_modalInteraction: modalInteraction,
	};
}

function makeMessage(
	selectInteraction: ReturnType<typeof makeSelectInteraction> | null,
	messageId: string = "msg-id",
) {
	return {
		id: messageId,
		awaitMessageComponent: vi.fn().mockResolvedValue(selectInteraction),
	};
}

function makeInteraction(overrides: {
	roleId?: string;
	hasRole?: boolean;
	inCachedGuild?: boolean;
	message?: ReturnType<typeof makeMessage>;
} = {}) {
	const {
		roleId = "game-role-id",
		hasRole = true,
		inCachedGuild = true,
		message,
	} = overrides;

	const msg = message ?? makeMessage(makeSelectInteraction("新規作成"));

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
		vi.mocked(GameManager.getInstance).mockReturnValue(
			mockGameManager as unknown as GameManager,
		);
		mockGameManager.updateGameData.mockResolvedValue(undefined);
	});

	describe("UI状態分岐: ロールバリデーション", () => {
		it("@everyone ロールは「選択できません」を返す", async () => {
			const interaction = makeInteraction({ roleId: EVERYONE_ROLE_ID });
			mockGameManager.getGame.mockResolvedValue(null);
			await handleData(interaction);
			expect(interaction.editReply).toHaveBeenCalledWith(
				expect.stringContaining("選択できません"),
			);
			expect(mockGameManager.getGame).not.toHaveBeenCalled();
		});

		it("ignoreRoleIds に含まれるロールは「選択できません」を返す", async () => {
			const interaction = makeInteraction({ roleId: "ignore-role-id" });
			await handleData(interaction);
			expect(interaction.editReply).toHaveBeenCalledWith(
				expect.stringContaining("選択できません"),
			);
			expect(mockGameManager.getGame).not.toHaveBeenCalled();
		});

		it("メンバーがロールを持っていない場合は「付与されていない」を返す", async () => {
			const interaction = makeInteraction({ hasRole: false });
			await handleData(interaction);
			expect(interaction.editReply).toHaveBeenCalledWith(
				expect.stringContaining("付与されていない"),
			);
			expect(mockGameManager.getGame).not.toHaveBeenCalled();
		});

		it("ギルド外から実行した場合はエラーを返す", async () => {
			const interaction = makeInteraction({ inCachedGuild: false });
			await handleData(interaction);
			expect(interaction.reply).toHaveBeenCalledWith(
				expect.objectContaining({ ephemeral: true }),
			);
			expect(interaction.deferReply).not.toHaveBeenCalled();
		});
	});

	describe("ロジック: モーダル入力のデータ処理", () => {
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
			const message = makeMessage(selectInteraction);
			const interaction = makeInteraction({ message });

			await handleData(interaction);

			expect(mockGameManager.updateGameData).toHaveBeenCalledWith(
				"game-role-id",
				"マップ",
				["マップA", "マップB"],
			);
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
			const message = makeMessage(selectInteraction);
			const interaction = makeInteraction({ message });

			await handleData(interaction);

			// 削除処理: 古いキーをnullで更新
			expect(mockGameManager.updateGameData).toHaveBeenCalledWith(
				"game-role-id",
				"マップ",
				null,
			);
		});

		it("キー名変更時: 旧キー削除 → 新キーで作成の2ステップになる", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { 旧キー: ["item1"] },
			});
			const selectInteraction = makeSelectInteraction("旧キー");
			selectInteraction.awaitModalSubmit.mockResolvedValue(
				makeModalInteraction({ key: "新キー", data: "item1\nitem2" }),
			);
			const message = makeMessage(selectInteraction);
			const interaction = makeInteraction({ message });

			await handleData(interaction);

			// 旧キーを削除
			expect(mockGameManager.updateGameData).toHaveBeenCalledWith(
				"game-role-id",
				"旧キー",
				null,
			);
			// 新キーで作成
			expect(mockGameManager.updateGameData).toHaveBeenCalledWith(
				"game-role-id",
				"新キー",
				["item1", "item2"],
			);
		});
	});

	describe("UI状態分岐: 操作結果メッセージ", () => {
		beforeEach(() => {
			mockGameManager.createGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: {},
			});
		});

		it("データ削除時: 「削除しました」メッセージ", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { マップ: ["マップA"] },
			});
			const selectInteraction = makeSelectInteraction("マップ");
			selectInteraction.awaitModalSubmit.mockResolvedValue(
				makeModalInteraction({ key: "マップ", data: "" }),
			);
			const message = makeMessage(selectInteraction);
			const interaction = makeInteraction({ message });

			await handleData(interaction);

			expect(interaction.editReply).toHaveBeenLastCalledWith(
				expect.objectContaining({ content: expect.stringContaining("削除しました") }),
			);
		});

		it("キー名変更を伴う更新時: 「○○を△△に更新しました」メッセージ", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { 旧キー: ["item1"] },
			});
			const selectInteraction = makeSelectInteraction("旧キー");
			selectInteraction.awaitModalSubmit.mockResolvedValue(
				makeModalInteraction({ key: "新キー", data: "item1\nitem2" }),
			);
			const message = makeMessage(selectInteraction);
			const interaction = makeInteraction({ message });

			await handleData(interaction);

			expect(interaction.editReply).toHaveBeenLastCalledWith(
				expect.objectContaining({
					content: expect.stringMatching(/「旧キー」.*「新キー」.*更新しました/),
				}),
			);
		});

		it("キー名変更なしの更新時: 「更新しました」メッセージ", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { マップ: ["マップA"] },
			});
			const selectInteraction = makeSelectInteraction("マップ");
			selectInteraction.awaitModalSubmit.mockResolvedValue(
				makeModalInteraction({ key: "マップ", data: "マップA\nマップB" }),
			);
			const message = makeMessage(selectInteraction);
			const interaction = makeInteraction({ message });

			await handleData(interaction);

			expect(interaction.editReply).toHaveBeenLastCalledWith(
				expect.objectContaining({ content: expect.stringContaining("更新しました") }),
			);
		});

		it("新規作成時: 「作成しました」メッセージ", async () => {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: {},
			});
			const selectInteraction = makeSelectInteraction("新規作成");
			selectInteraction.awaitModalSubmit.mockResolvedValue(
				makeModalInteraction({ key: "新データ", data: "item1\nitem2" }),
			);
			const message = makeMessage(selectInteraction);
			const interaction = makeInteraction({ message });

			await handleData(interaction);

			expect(interaction.editReply).toHaveBeenLastCalledWith(
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
			const message = makeMessage(selectInteraction);
			const interaction = makeInteraction({ message });

			await handleData(interaction);

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
			const message = makeMessage(selectInteraction);
			const interaction = makeInteraction({ message });

			await handleData(interaction);

			expect(mockGameManager.updateGameData).not.toHaveBeenCalled();
		});
	});
});
