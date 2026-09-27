import type { DatabaseSync } from "node:sqlite";
import { Client } from "discord.js";
import { registerEventHandlers } from "../events";
import { EventRoomManager } from "../features/events/EventRoomManager";
import { GameManager } from "../features/games/GameManager";
import { GameStore } from "../features/games/GameStore";
import { RoomManager } from "../features/rooms/RoomManager";
import { RoomStore } from "../features/rooms/RoomStore";
import type { BotConfig } from "./config";
import type { AppContext } from "./context";
import { intents } from "./intents";

/**
 * 永続化に使うデータベース
 */
export interface BotDatabases {
	games: DatabaseSync;
	rooms: DatabaseSync;
}

/**
 * 依存を組み立て、イベントハンドラーを登録したクライアントを返す
 * ログインは呼び出し側が行う
 */
export function createBot(
	config: BotConfig,
	databases: BotDatabases,
): { client: Client; ctx: AppContext } {
	const gameManager = new GameManager(new GameStore(databases.games));
	const roomManager = new RoomManager(new RoomStore(databases.rooms), gameManager, config);
	const eventRoomManager = new EventRoomManager(roomManager, config);

	const ctx: AppContext = {
		config,
		gameManager,
		roomManager,
		eventRoomManager,
	};

	const client = new Client({ intents });
	registerEventHandlers(client, ctx);

	return { client, ctx };
}
