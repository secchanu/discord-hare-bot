import type { Snowflake } from "discord.js";
import { createKeyvStore } from "../../services/database/keyv";
import type { Game } from "./types";

/**
 * ギルドゲームの永続化ストア
 */
export class GameStore {
	private static instance: GameStore;
	private store;

	private constructor() {
		this.store = createKeyvStore<Game>("games.sqlite");
	}

	public static getInstance(): GameStore {
		if (!GameStore.instance) {
			GameStore.instance = new GameStore();
		}
		return GameStore.instance;
	}

	/**
	 * ゲームを保存
	 */
	async set(roleId: Snowflake, game: Game): Promise<void> {
		await this.store.set(roleId, game);
	}

	/**
	 * ゲームを取得
	 */
	async get(roleId: Snowflake): Promise<Game | undefined> {
		return await this.store.get(roleId);
	}

	/**
	 * ゲームの存在確認
	 */
	async has(roleId: Snowflake): Promise<boolean> {
		return await this.store.has(roleId);
	}

	/**
	 * ゲームを削除
	 */
	async delete(roleId: Snowflake): Promise<void> {
		await this.store.delete(roleId);
	}
}
