import { loadConfig, validateConfig } from "./bot/config";
import { createBot } from "./bot/createBot";
import { EXIT_CODE } from "./constants";
import { openDatabase } from "./services/database/KeyValueStore";

/**
 * 設定を検証し、データベースを開いて Bot を起動する
 */
async function main(): Promise<void> {
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

	const { client } = createBot(config, {
		games: openDatabase("games.sqlite"),
		rooms: openDatabase("rooms.sqlite"),
	});
	console.log("Event handlers registered");

	try {
		const shutdown = (): void => {
			console.log("Shutting down bot...");
			client.destroy();
			process.exit(EXIT_CODE.SUCCESS);
		};
		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);

		await client.login(config.botToken);
		console.log("Bot initialization complete");
	} catch (error) {
		console.error("Failed to start bot", error);
		process.exit(EXIT_CODE.ERROR);
	}
}

process.on("unhandledRejection", (error) => {
	console.error("Unhandled rejection", error);
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception", error);
	process.exit(EXIT_CODE.ERROR);
});

main();
