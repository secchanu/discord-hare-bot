import type { EventRoomManager } from "../features/events/EventRoomManager";
import type { GameManager } from "../features/games/GameManager";
import type { RoomManager } from "../features/rooms/RoomManager";
import type { BotConfig } from "./config";

/**
 * アプリケーション全体の依存をまとめたコンテキスト
 * createBot で組み立て、イベントハンドラーとコマンドに渡す
 */
export interface AppContext {
	config: BotConfig;
	gameManager: GameManager;
	roomManager: RoomManager;
	eventRoomManager: EventRoomManager;
}
