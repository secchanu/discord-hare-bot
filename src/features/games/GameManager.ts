import type { Role, Snowflake } from "discord.js";
import { GameStore } from "./GameStore";
import { defaultGame, type Game } from "./types";

/**
 * ギルドゲームマネージャー
 * Discord Role ベースのゲーム管理
 */
export class GameManager {
	private static instance: GameManager | undefined;
	private store: GameStore;

	private constructor() {
		this.store = GameStore.getInstance();
	}

	public static getInstance(): GameManager {
		if (!GameManager.instance) {
			GameManager.instance = new GameManager();
		}
		return GameManager.instance;
	}

	/**
	 * テスト用: インスタンスをリセット
	 * @internal
	 */
	public static resetInstance(): void {
		GameManager.instance = undefined;
	}

	/**
	 * デフォルトゲームを取得
	 */
	getDefaultGame(): Game {
		return defaultGame;
	}

	/**
	 * ゲームを取得
	 */
	async getGame(roleId: Snowflake): Promise<Game | null> {
		if (!roleId) return this.getDefaultGame();

		const game = await this.store.get(roleId);
		return game ?? null;
	}

	/**
	 * ロールからゲームを作成
	 */
	async createGame(role: Role): Promise<Game> {
		const game: Game = {
			id: role.id,
			name: role.name,
			data: {},
		};

		await this.store.set(role.id, game);
		return game;
	}

	/**
	 * ゲームデータを更新
	 */
	async updateGameData(
		roleId: Snowflake,
		key: string,
		data: string[] | null,
	): Promise<void> {
		const game = await this.store.get(roleId);
		if (!game) return;

		if (!data || data.length === 0) {
			// データが空の場合はキーを削除
			delete game.data[key];
		} else {
			game.data[key] = data;
		}

		await this.store.set(roleId, game);
	}

	/**
	 * ゲームを削除
	 */
	async deleteGame(roleId: Snowflake): Promise<void> {
		await this.store.delete(roleId);
	}
}
