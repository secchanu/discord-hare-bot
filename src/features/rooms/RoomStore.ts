import type { Snowflake } from "discord.js";
import { createKeyvStore } from "../../services/database/keyv";
import type { RoomData } from "./types";

/**
 * ルームの永続化ストア
 */
export class RoomStore {
	private static instance: RoomStore;
	private store;

	private constructor() {
		this.store = createKeyvStore<RoomData>("rooms.sqlite");
	}

	public static getInstance(): RoomStore {
		if (!RoomStore.instance) {
			RoomStore.instance = new RoomStore();
		}
		return RoomStore.instance;
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
	 * ルームの存在確認
	 */
	async has(roomId: Snowflake): Promise<boolean> {
		return await this.store.has(roomId);
	}

	/**
	 * 全ルームデータを取得
	 */
	async getAll(): Promise<RoomData[]> {
		try {
			if (!this.store.iterator) {
				console.warn(
					"[RoomStore] Iterator not available, returning empty array",
				);
				return [];
			}

			const rooms: RoomData[] = [];
			const iterator = this.store.iterator(this.store.namespace);

			for await (const [_, value] of iterator) {
				rooms.push(value);
			}

			return rooms;
		} catch (error) {
			console.error("[RoomStore] Failed to get all rooms:", error);
			return [];
		}
	}

	/**
	 * ギルドIDで絞り込み
	 */
	async getByGuildId(guildId: Snowflake): Promise<RoomData[]> {
		const allRooms = await this.getAll();
		return allRooms.filter((room) => room.guildId === guildId);
	}

	/**
	 * ルームを削除
	 */
	async delete(roomId: Snowflake): Promise<void> {
		await this.store.delete(roomId);
	}

	/**
	 * 全データをクリア
	 */
	async clear(): Promise<void> {
		await this.store.clear();
	}
}
