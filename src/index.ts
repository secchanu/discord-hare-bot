import { client, initializeClient } from "./bot/client";
import { config } from "./bot/config";
import { EXIT_CODE } from "./constants";
import { registerEventHandlers } from "./events";

/**
 * Bot のメインエントリーポイント
 */
async function main(): Promise<void> {
	try {
		// イベントハンドラーを登録
		registerEventHandlers(client);
		console.log("Event handlers registered");

		// Bot を起動
		await initializeClient(config.botToken);
		console.log("Bot initialization complete");
	} catch (error) {
		console.error("Failed to start bot", error);
		process.exit(EXIT_CODE.ERROR);
	}
}

// シャットダウンハンドラー
process.on("SIGINT", () => {
	console.log("Shutting down bot...");
	client.destroy();
	process.exit(EXIT_CODE.SUCCESS);
});

process.on("SIGTERM", () => {
	console.log("Shutting down bot...");
	client.destroy();
	process.exit(EXIT_CODE.SUCCESS);
});

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
