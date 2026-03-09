import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameManager } from "./GameManager";
import { GameStore } from "./GameStore";
import { defaultGame } from "./types";

vi.mock("./GameStore", () => ({
	GameStore: {
		getInstance: vi.fn(),
	},
}));

const mockStore = {
	get: vi.fn(),
	set: vi.fn(),
	delete: vi.fn(),
};

describe("GameManager", () => {
	beforeEach(() => {
		vi.mocked(GameStore.getInstance).mockReturnValue(
			mockStore as unknown as GameStore,
		);
		GameManager.resetInstance();
		vi.clearAllMocks();
	});

	describe("getDefaultGame()", () => {
		it("デフォルトゲームを返す", () => {
			const manager = GameManager.getInstance();
			const result = manager.getDefaultGame();
			expect(result).toEqual(defaultGame);
		});
	});

	describe("getGame()", () => {
		it("空文字のroleIdを渡した場合はデフォルトゲームを返す", async () => {
			const manager = GameManager.getInstance();
			const result = await manager.getGame("");
			expect(result).toEqual(defaultGame);
			expect(mockStore.get).not.toHaveBeenCalled();
		});

		it("ストアに存在するゲームを返す", async () => {
			const game = { id: "role-1", name: "ゲームA", data: {} };
			mockStore.get.mockResolvedValue(game);

			const manager = GameManager.getInstance();
			const result = await manager.getGame("role-1");

			expect(mockStore.get).toHaveBeenCalledWith("role-1");
			expect(result).toEqual(game);
		});

		it("ストアにゲームが存在しない場合はnullを返す", async () => {
			mockStore.get.mockResolvedValue(undefined);

			const manager = GameManager.getInstance();
			const result = await manager.getGame("unknown-role");

			expect(result).toBeNull();
		});
	});

	describe("createGame()", () => {
		it("ロールからゲームを作成してストアに保存する", async () => {
			mockStore.set.mockResolvedValue(undefined);

			const role = { id: "role-2", name: "ゲームB" };
			const manager = GameManager.getInstance();
			const result = await manager.createGame(role as never);

			expect(result).toEqual({ id: "role-2", name: "ゲームB", data: {} });
			expect(mockStore.set).toHaveBeenCalledWith("role-2", {
				id: "role-2",
				name: "ゲームB",
				data: {},
			});
		});
	});

	describe("updateGameData()", () => {
		it("存在しないゲームの場合は何もしない", async () => {
			mockStore.get.mockResolvedValue(undefined);

			const manager = GameManager.getInstance();
			await manager.updateGameData("no-role", "key", ["value"]);

			expect(mockStore.set).not.toHaveBeenCalled();
		});

		it("データを渡した場合はキーにデータを追加してストアに保存する", async () => {
			const game = { id: "role-3", name: "ゲームC", data: {} };
			mockStore.get.mockResolvedValue(game);
			mockStore.set.mockResolvedValue(undefined);

			const manager = GameManager.getInstance();
			await manager.updateGameData("role-3", "マップ", ["マップA", "マップB"]);

			expect(mockStore.set).toHaveBeenCalledWith("role-3", {
				id: "role-3",
				name: "ゲームC",
				data: { マップ: ["マップA", "マップB"] },
			});
		});

		it("空配列を渡した場合はキーを削除してストアに保存する", async () => {
			const game = {
				id: "role-3",
				name: "ゲームC",
				data: { マップ: ["マップA"] },
			};
			mockStore.get.mockResolvedValue(game);
			mockStore.set.mockResolvedValue(undefined);

			const manager = GameManager.getInstance();
			await manager.updateGameData("role-3", "マップ", []);

			expect(mockStore.set).toHaveBeenCalledWith("role-3", {
				id: "role-3",
				name: "ゲームC",
				data: {},
			});
		});

		it("nullを渡した場合はキーを削除してストアに保存する", async () => {
			const game = {
				id: "role-3",
				name: "ゲームC",
				data: { マップ: ["マップA"] },
			};
			mockStore.get.mockResolvedValue(game);
			mockStore.set.mockResolvedValue(undefined);

			const manager = GameManager.getInstance();
			await manager.updateGameData("role-3", "マップ", null);

			expect(mockStore.set).toHaveBeenCalledWith("role-3", {
				id: "role-3",
				name: "ゲームC",
				data: {},
			});
		});
	});

	describe("deleteGame()", () => {
		it("ストアからゲームを削除する", async () => {
			mockStore.delete.mockResolvedValue(undefined);

			const manager = GameManager.getInstance();
			await manager.deleteGame("role-4");

			expect(mockStore.delete).toHaveBeenCalledWith("role-4");
		});
	});
});
