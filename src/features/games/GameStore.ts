import type { Snowflake } from "discord.js";
import { KeyValueStore } from "../../services/database/KeyValueStore";
import type { Game } from "./types";

/**
 * ギルドゲームの永続化ストア
 */
export class GameStore {
	private store;

	constructor(filename = "games.sqlite") {
		this.store = new KeyValueStore<Game>(filename);
	}

	/**
	 * ゲームを保存
	 */
	async set(roleId: Snowflake, game: Game): Promise<void> {
		this.store.set(roleId, game);
	}

	/**
	 * ゲームを取得
	 */
	async get(roleId: Snowflake): Promise<Game | undefined> {
		return this.store.get(roleId);
	}

	/**
	 * ゲームを削除
	 */
	async delete(roleId: Snowflake): Promise<void> {
		this.store.delete(roleId);
	}
}
