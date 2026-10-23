import type { DatabaseSync } from "node:sqlite";
import { Client } from "discord.js";
import { registerEventHandlers } from "../events";
import { Assistant } from "../features/assistant/Assistant";
import { Claude, type ClaudeApi, claudeApi } from "../features/assistant/Claude";
import { ConversationStore } from "../features/assistant/ConversationStore";
import { FileStore } from "../features/assistant/FileStore";
import { EventRoomManager } from "../features/events/EventRoomManager";
import { GameManager } from "../features/games/GameManager";
import { GameStore } from "../features/games/GameStore";
import { RoomManager } from "../features/rooms/RoomManager";
import { RoomStore } from "../features/rooms/RoomStore";
import type { BotConfig } from "./config";
import type { AppContext } from "./context";
import { assistantIntents, intents } from "./intents";
import { partials } from "./partials";

/**
 * 永続化に使うデータベースの名前
 */
export type DatabaseName = "games" | "rooms" | "conversations" | "files";

/**
 * 名前で指定したデータベースを開く
 */
export type Databases = (name: DatabaseName) => DatabaseSync;

/**
 * 外部のサービスとのやり取りの差し替え
 */
export interface BotOverrides {
	claudeApi?: ClaudeApi;
}

/**
 * 依存を組み立て、イベントハンドラーを登録したクライアントを返す
 * データベースは使う機能のものだけを開く
 * ログインは呼び出し側が行う
 */
export function createBot(
	config: BotConfig,
	databases: Databases,
	overrides: BotOverrides = {},
): { client: Client; ctx: AppContext } {
	let assistant: Assistant | undefined;
	if (config.assistant) {
		const api = overrides.claudeApi ?? claudeApi(config.assistant.anthropicApiKey);
		assistant = new Assistant(
			new Claude(api.createMessage, config.assistant.model),
			new ConversationStore(databases("conversations")),
			api.files,
			new FileStore(databases("files")),
		);
	}

	const gameManager = new GameManager(new GameStore(databases("games")));
	const roomManager = new RoomManager(new RoomStore(databases("rooms")), gameManager, config, {
		removed: assistant ? (roomId) => assistant.forget(roomId) : undefined,
	});
	const eventRoomManager = new EventRoomManager(roomManager, config);

	const ctx: AppContext = {
		config,
		gameManager,
		roomManager,
		eventRoomManager,
		assistant,
	};

	const client = new Client({
		intents: assistant ? [...intents, ...assistantIntents] : intents,
		partials,
	});
	registerEventHandlers(client, ctx);

	return { client, ctx };
}
