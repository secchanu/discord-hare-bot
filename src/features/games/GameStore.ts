import type { DatabaseSync } from "node:sqlite";
import type { Snowflake } from "discord.js";
import { KeyValueStore } from "../../services/database/KeyValueStore";
import type { Game } from "./types";

/**
 * ゲームの永続化ストア
 */
export class GameStore {
	private store;

	constructor(db: DatabaseSync) {
		this.store = new KeyValueStore<Game>(db);
	}

	/**
	 * ゲームを保存する
	 */
	async set(roleId: Snowflake, game: Game): Promise<void> {
		this.store.set(roleId, game);
	}

	/**
	 * ゲームを取得する
	 */
	async get(roleId: Snowflake): Promise<Game | undefined> {
		return this.store.get(roleId);
	}
}
