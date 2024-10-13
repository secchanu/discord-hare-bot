import type { Client } from "discord.js";
import { Events } from "discord.js";
import { registerCommands } from "../commands";
import { RoomManager } from "../features/rooms/RoomManager";

/**
 * Bot起動時の処理
 * Discord.js の ClientReady イベントハンドラー
 */
export const setupReadyHandler = (client: Client): void => {
	client.once(Events.ClientReady, async (readyClient) => {
		console.log(`Logged in as ${readyClient.user.tag}`);

		// コマンドの登録
		await registerCommands(readyClient);

		// ルームの復旧処理
		const roomManager = RoomManager.getInstance();
		await roomManager.recoverRooms(readyClient);

		console.log("Bot is ready!");
	});
};
