import type { Client, Interaction } from "discord.js";
import { Events } from "discord.js";
import { handleCommand } from "../commands";

/**
 * インタラクション作成時の処理
 * Discord.js の InteractionCreate イベントハンドラー
 */
export const setupInteractionCreateHandler = (client: Client): void => {
	client.on(Events.InteractionCreate, async (interaction: Interaction) => {
		if (!interaction.isChatInputCommand()) return;
		if (!interaction.inCachedGuild()) return;

		try {
			await handleCommand(interaction);
		} catch (error) {
			console.error("Error handling command:", error);

			const reply = {
				content: "コマンドの実行中にエラーが発生しました。",
				ephemeral: true,
			};

			if (interaction.deferred || interaction.replied) {
				await interaction.editReply(reply);
			} else {
				await interaction.reply(reply);
			}
		}
	});
};
