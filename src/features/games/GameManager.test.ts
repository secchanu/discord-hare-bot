import type { Role, Snowflake } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameManager } from "./GameManager";
import { GameStore } from "./GameStore";
import { defaultGame, type Game } from "./types";

// GameStoreをモック
vi.mock("./GameStore", () => ({
	GameStore: {
		getInstance: vi.fn(),
	},
}));

describe("GameManager Business Logic", () => {
	let mockStore: {
		get: ReturnType<typeof vi.fn>;
		set: ReturnType<typeof vi.fn>;
		delete: ReturnType<typeof vi.fn>;
		has: ReturnType<typeof vi.fn>;
	};
	let gameManager: GameManager;

	beforeEach(() => {
		// モックストアを作成
		mockStore = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			has: vi.fn(),
		};

		// GameStore.getInstanceがモックストアを返すように設定
		vi.mocked(GameStore.getInstance).mockReturnValue(
			mockStore as unknown as GameStore,
		);

		// シングルトンインスタンスをリセット
		GameManager.resetInstance();
		gameManager = GameManager.getInstance();
	});

	describe("getDefaultGame", () => {
		it("デフォルトゲームを正しく返す", () => {
			const result = gameManager.getDefaultGame();

			expect(result).toBe(defaultGame);
			expect(result).toEqual({
				id: "",
				name: "Free",
				data: {},
			});
		});

		it("デフォルトゲームは不変である", () => {
			const game1 = gameManager.getDefaultGame();
			const game2 = gameManager.getDefaultGame();

			expect(game1).toBe(game2); // 同じオブジェクト参照
		});
	});

	describe("getGame", () => {
		it("roleIdが空の場合はデフォルトゲームを返す", async () => {
			const result = await gameManager.getGame("");

			expect(result).toBe(defaultGame);
			expect(mockStore.get).not.toHaveBeenCalled();
		});

		it("roleIdがnullやundefinedの場合もデフォルトゲームを返す", async () => {
			const result1 = await gameManager.getGame(null as unknown as Snowflake);
			const result2 = await gameManager.getGame(
				undefined as unknown as Snowflake,
			);

			expect(result1).toBe(defaultGame);
			expect(result2).toBe(defaultGame);
			expect(mockStore.get).not.toHaveBeenCalled();
		});

		it("ストアにゲームが存在する場合はそれを返す", async () => {
			const mockGame: Game = {
				id: "role-123",
				name: "TestGame",
				data: { key1: ["value1", "value2"] },
			};
			mockStore.get.mockResolvedValue(mockGame);

			const result = await gameManager.getGame("role-123");

			expect(result).toBe(mockGame);
			expect(mockStore.get).toHaveBeenCalledWith("role-123");
		});

		it("ストアにゲームが存在しない場合はnullを返す", async () => {
			mockStore.get.mockResolvedValue(undefined);

			const result = await gameManager.getGame("role-456");

			expect(result).toBeNull();
			expect(mockStore.get).toHaveBeenCalledWith("role-456");
		});
	});

	describe("createGame", () => {
		it("ロール情報からゲームを作成して保存する", async () => {
			const mockRole = {
				id: "role-123",
				name: "Valorant",
			} as unknown as Role;

			const result = await gameManager.createGame(mockRole);

			expect(result).toEqual({
				id: "role-123",
				name: "Valorant",
				data: {},
			});

			expect(mockStore.set).toHaveBeenCalledWith("role-123", {
				id: "role-123",
				name: "Valorant",
				data: {},
			});
		});

		it("作成されるゲームのdataは空オブジェクトで初期化される", async () => {
			const mockRole = {
				id: "role-456",
				name: "Apex",
			} as unknown as Role;

			const result = await gameManager.createGame(mockRole);

			expect(result.data).toEqual({});
			expect(Object.keys(result.data)).toHaveLength(0);
		});
	});

	describe("updateGameData", () => {
		it("既存のゲームデータを更新する", async () => {
			const existingGame: Game = {
				id: "role-123",
				name: "TestGame",
				data: { oldKey: ["oldValue"] },
			};
			mockStore.get.mockResolvedValue(existingGame);

			await gameManager.updateGameData("role-123", "newKey", [
				"value1",
				"value2",
			]);

			expect(mockStore.set).toHaveBeenCalledWith("role-123", {
				id: "role-123",
				name: "TestGame",
				data: {
					oldKey: ["oldValue"],
					newKey: ["value1", "value2"],
				},
			});
		});

		it("dataがnullの場合は該当キーを削除する", async () => {
			const existingGame: Game = {
				id: "role-123",
				name: "TestGame",
				data: {
					key1: ["value1"],
					key2: ["value2"],
				},
			};
			mockStore.get.mockResolvedValue(existingGame);

			await gameManager.updateGameData("role-123", "key1", null);

			expect(mockStore.set).toHaveBeenCalledWith("role-123", {
				id: "role-123",
				name: "TestGame",
				data: {
					key2: ["value2"], // key1が削除されている
				},
			});
		});

		it("dataが空配列の場合も該当キーを削除する", async () => {
			const existingGame: Game = {
				id: "role-123",
				name: "TestGame",
				data: {
					key1: ["value1"],
					key2: ["value2"],
				},
			};
			mockStore.get.mockResolvedValue(existingGame);

			await gameManager.updateGameData("role-123", "key2", []);

			expect(mockStore.set).toHaveBeenCalledWith("role-123", {
				id: "role-123",
				name: "TestGame",
				data: {
					key1: ["value1"], // key2が削除されている
				},
			});
		});

		it("ゲームが存在しない場合は何もしない", async () => {
			mockStore.get.mockResolvedValue(undefined);

			await gameManager.updateGameData("role-999", "key", ["value"]);

			expect(mockStore.set).not.toHaveBeenCalled();
		});

		it("既存のキーを上書きする", async () => {
			const existingGame: Game = {
				id: "role-123",
				name: "TestGame",
				data: {
					key1: ["oldValue1", "oldValue2"],
				},
			};
			mockStore.get.mockResolvedValue(existingGame);

			await gameManager.updateGameData("role-123", "key1", ["newValue1"]);

			expect(mockStore.set).toHaveBeenCalledWith("role-123", {
				id: "role-123",
				name: "TestGame",
				data: {
					key1: ["newValue1"], // 上書きされている
				},
			});
		});
	});

	describe("deleteGame", () => {
		it("指定されたロールIDのゲームを削除する", async () => {
			await gameManager.deleteGame("role-123");

			expect(mockStore.delete).toHaveBeenCalledWith("role-123");
		});

		it("存在しないゲームの削除でもエラーにならない", async () => {
			mockStore.delete.mockResolvedValue(undefined);

			await expect(gameManager.deleteGame("role-999")).resolves.not.toThrow();
		});
	});

	describe("シングルトンパターン", () => {
		it("getInstanceは常に同じインスタンスを返す", () => {
			const instance1 = GameManager.getInstance();
			const instance2 = GameManager.getInstance();

			expect(instance1).toBe(instance2);
		});
	});
});
