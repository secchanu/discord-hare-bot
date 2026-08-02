import type { EventRoomManager } from "../features/events/EventRoomManager";
import type { GameManager } from "../features/games/GameManager";
import type { RoomManager } from "../features/rooms/RoomManager";
import type { BotConfig } from "./config";

/**
 * アプリケーション全体の依存をまとめたコンテキスト
 * composition root（index.ts）で構築し、イベントハンドラー・コマンドへ注入する
 */
export interface AppContext {
	config: BotConfig;
	gameManager: GameManager;
	roomManager: RoomManager;
	eventRoomManager: EventRoomManager;
}
