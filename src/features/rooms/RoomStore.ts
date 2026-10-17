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
	set(roomId: Snowflake, data: RoomData): void {
		this.store.set(roomId, data);
	}

	/**
	 * すべてのルームを取得する
	 */
	getAll(): RoomData[] {
		return this.store.getAll();
	}

	/**
	 * ルームを削除する
	 */
	delete(roomId: Snowflake): void {
		this.store.delete(roomId);
	}
}
