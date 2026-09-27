import type { Client } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../bot/context";
import { registerCommands } from "../commands";
import { EXIT_CODE } from "../constants";

/**
 * Bot の起動時に、コマンドを登録してルームを復旧する
 */
export const setupReadyHandler = (client: Client, ctx: AppContext): void => {
	client.once(Events.ClientReady, async (readyClient) => {
		try {
			console.log(`Logged in as ${readyClient.user.tag}`);

			const guild = await readyClient.guilds.fetch(ctx.config.guildId);

			await registerCommands(guild);

			await ctx.roomManager.recoverRooms(guild);
			await ctx.roomManager.reconcile(guild);

			console.log("Bot is ready!");
		} catch (error) {
			// 起動処理を終えられない Bot は運用できないため終了する
			console.error("Failed to initialize bot:", error);
			process.exit(EXIT_CODE.ERROR);
		}
	});
};
