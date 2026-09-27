import type { DatabaseSync } from "node:sqlite";
import type { Snowflake } from "discord.js";
import { KeyValueStore } from "../../services/database/KeyValueStore";
import type { RoomData } from "./types";

/**
 * ルームの永続化ストア
 */
export class RoomStore {
	private store;

	constructor(db: DatabaseSync) {
		this.store = new KeyValueStore<RoomData>(db);
	}

	/**
	 * ルームを保存する
	 */
	async set(roomId: Snowflake, data: RoomData): Promise<void> {
		this.store.set(roomId, data);
	}

	/**
	 * すべてのルームを取得する
	 */
	async getAll(): Promise<RoomData[]> {
		return this.store.getAll();
	}

	/**
	 * ルームを削除する
	 */
	async delete(roomId: Snowflake): Promise<void> {
		this.store.delete(roomId);
	}
}
