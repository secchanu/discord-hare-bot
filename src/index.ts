import { Client } from "discord.js";
import type { AppContext } from "./bot/context";
import { loadConfig, validateConfig } from "./bot/config";
import { intents } from "./bot/intents";
import { EXIT_CODE } from "./constants";
import { registerEventHandlers } from "./events";
import { EventRoomManager } from "./features/events/EventRoomManager";
import { GameManager } from "./features/games/GameManager";
import { GameStore } from "./features/games/GameStore";
import { RoomManager } from "./features/rooms/RoomManager";
import { RoomStore } from "./features/rooms/RoomStore";

/**
 * Bot のメインエントリーポイント（composition root）
 * 設定の検証と依存の組み立てをここで行い、各層へ注入する
 */
async function main(): Promise<void> {
	// 設定の読み込みと検証
	const config = loadConfig();
	const errors = validateConfig(config);
	if (errors.length > 0) {
		console.error("Configuration errors:");
		for (const error of errors) {
			console.error(`  - ${error}`);
		}
		console.error("\nPlease check your environment variables or .env file");
		process.exit(EXIT_CODE.ERROR);
	}

	// 依存の組み立て
	const gameManager = new GameManager(new GameStore());
	const roomManager = new RoomManager(new RoomStore(), gameManager, config);
	const eventRoomManager = new EventRoomManager(roomManager, config);

	const ctx: AppContext = {
		config,
		gameManager,
		roomManager,
		eventRoomManager,
	};

	const client = new Client({ intents });

	try {
		// イベントハンドラーを登録
		registerEventHandlers(client, ctx);
		console.log("Event handlers registered");

		// シャットダウンハンドラー
		const shutdown = (): void => {
			console.log("Shutting down bot...");
			client.destroy();
			process.exit(EXIT_CODE.SUCCESS);
		};
		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);

		// Bot を起動
		await client.login(config.botToken);
		console.log("Bot initialization complete");
	} catch (error) {
		console.error("Failed to start bot", error);
		process.exit(EXIT_CODE.ERROR);
	}
}

// エラーハンドラー
process.on("unhandledRejection", (error) => {
	console.error("Unhandled rejection", error);
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception", error);
	process.exit(EXIT_CODE.ERROR);
});

// Bot を起動
main();
