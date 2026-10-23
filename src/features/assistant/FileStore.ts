import type { DatabaseSync } from "node:sqlite";
import type { Snowflake } from "discord.js";
import { KeyValueStore } from "../../services/database/KeyValueStore";

/**
 * ルームごとに Claude API へアップロードしたファイルのIDの永続化ストア
 */
export class FileStore {
	private store;

	constructor(db: DatabaseSync) {
		this.store = new KeyValueStore<string[]>(db);
	}

	/**
	 * ルームのファイルのIDを取得する
	 */
	get(roomId: Snowflake): string[] {
		return this.store.get(roomId) ?? [];
	}

	/**
	 * ルームのファイルのIDを追加する
	 */
	add(roomId: Snowflake, fileId: string): void {
		this.store.set(roomId, [...this.get(roomId), fileId]);
	}

	/**
	 * ルームのファイルのIDを取り除く
	 * @returns 取り除いたファイルのID（持っていなかったIDは含まない）
	 */
	remove(roomId: Snowflake, fileIds: string[]): string[] {
		const current = this.get(roomId);
		const rest = current.filter((fileId) => !fileIds.includes(fileId));
		if (rest.length > 0) this.store.set(roomId, rest);
		else this.store.delete(roomId);
		return current.filter((fileId) => fileIds.includes(fileId));
	}

	/**
	 * ルームのファイルのIDをすべて取り除く
	 * @returns 取り除いたファイルのID
	 */
	removeAll(roomId: Snowflake): string[] {
		const fileIds = this.get(roomId);
		this.store.delete(roomId);
		return fileIds;
	}
}
