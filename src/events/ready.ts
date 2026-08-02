import type { Client } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../bot/context";
import { registerCommands } from "../commands";
import { EXIT_CODE } from "../constants";

/**
 * Bot起動時の処理
 * Discord.js の ClientReady イベントハンドラー
 */
export const setupReadyHandler = (client: Client, ctx: AppContext): void => {
	client.once(Events.ClientReady, async (readyClient) => {
		try {
			console.log(`Logged in as ${readyClient.user.tag}`);

			const guild = await readyClient.guilds.fetch(ctx.config.guildId);

			// コマンドの登録（単一ギルド運用のためギルドコマンドとして即時反映する）
			await registerCommands(guild);

			// ルームの復旧と整合性回復
			await ctx.roomManager.recoverRooms(guild);
			await ctx.roomManager.reconcile(guild);

			console.log("Bot is ready!");
		} catch (error) {
			// 対象ギルドにアクセスできない場合は運用不能のため終了する
			console.error("Failed to initialize bot:", error);
			process.exit(EXIT_CODE.ERROR);
		}
	});
};
