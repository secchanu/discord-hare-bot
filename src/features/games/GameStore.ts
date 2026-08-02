import type { Snowflake } from "discord.js";
import { createKeyvStore } from "../../services/database/keyv";
import type { Game } from "./types";

/**
 * ギルドゲームの永続化ストア
 */
export class GameStore {
	private store;

	constructor(filename = "games.sqlite") {
		this.store = createKeyvStore<Game>(filename);
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
	 * ゲームを削除
	 */
	async delete(roleId: Snowflake): Promise<void> {
		await this.store.delete(roleId);
	}
}
