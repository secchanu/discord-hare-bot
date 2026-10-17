import type { DatabaseSync } from "node:sqlite";
import type { Snowflake } from "discord.js";
import { KeyValueStore } from "../../services/database/KeyValueStore";
import type { Conversation } from "./types";

/**
 * ルームごとの会話の永続化ストア
 */
export class ConversationStore {
	private store;

	constructor(db: DatabaseSync) {
		this.store = new KeyValueStore<Conversation>(db);
	}

	/**
	 * ルームの会話を取得する
	 */
	get(roomId: Snowflake): Conversation | undefined {
		return this.store.get(roomId);
	}

	/**
	 * ルームの会話を保存する
	 */
	set(roomId: Snowflake, conversation: Conversation): void {
		this.store.set(roomId, conversation);
	}

	/**
	 * ルームの会話を削除する
	 */
	delete(roomId: Snowflake): void {
		this.store.delete(roomId);
	}
}
