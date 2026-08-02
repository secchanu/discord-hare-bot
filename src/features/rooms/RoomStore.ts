import type { Snowflake } from "discord.js";
import { KeyValueStore } from "../../services/database/KeyValueStore";
import type { RoomData } from "./types";

/**
 * ルームの永続化ストア
 */
export class RoomStore {
	private store;

	constructor(filename = "rooms.sqlite") {
		this.store = new KeyValueStore<RoomData>(filename);
	}

	/**
	 * ルームを保存
	 */
	async set(roomId: Snowflake, data: RoomData): Promise<void> {
		this.store.set(roomId, data);
	}

	/**
	 * ルームを取得
	 */
	async get(roomId: Snowflake): Promise<RoomData | undefined> {
		return this.store.get(roomId);
	}

	/**
	 * 全ルームデータを取得
	 */
	async getAll(): Promise<RoomData[]> {
		return this.store.getAll();
	}

	/**
	 * ルームを削除
	 */
	async delete(roomId: Snowflake): Promise<void> {
		this.store.delete(roomId);
	}
}
