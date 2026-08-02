import type { Snowflake } from "discord.js";
import { createKeyvStore } from "../../services/database/keyv";
import type { RoomData } from "./types";

/**
 * ルームの永続化ストア
 */
export class RoomStore {
	private store;

	constructor(filename = "rooms.sqlite") {
		this.store = createKeyvStore<RoomData>(filename);
	}

	/**
	 * ルームを保存
	 */
	async set(roomId: Snowflake, data: RoomData): Promise<void> {
		await this.store.set(roomId, data);
	}

	/**
	 * ルームを取得
	 */
	async get(roomId: Snowflake): Promise<RoomData | undefined> {
		return await this.store.get(roomId);
	}

	/**
	 * 全ルームデータを取得
	 */
	async getAll(): Promise<RoomData[]> {
		if (!this.store.iterator) {
			console.warn("[RoomStore] Iterator not available, returning empty array");
			return [];
		}

		const rooms: RoomData[] = [];
		const iterator = this.store.iterator(this.store.namespace);

		for await (const [_, value] of iterator) {
			rooms.push(value);
		}

		return rooms;
	}

	/**
	 * ルームを削除
	 */
	async delete(roomId: Snowflake): Promise<void> {
		await this.store.delete(roomId);
	}
}
