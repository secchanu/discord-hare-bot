import type { Client, Interaction } from "discord.js";
import { Events, MessageFlags } from "discord.js";
import type { AppContext } from "../bot/context";
import { handleCommand } from "../commands";
import { TIMEOUT } from "../constants";

/**
 * インタラクション作成時の処理
 * Discord.js の InteractionCreate イベントハンドラー
 */
export const setupInteractionCreateHandler = (client: Client, ctx: AppContext): void => {
	client.on(Events.InteractionCreate, async (interaction: Interaction) => {
		// コンポーネント・モーダルは各コマンドのコレクターが処理する。
		// Bot再起動でコレクターを失ったものだけがここで未応答のまま残るため、
		// 猶予を置いて未応答なら期限切れとして返す
		if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
			setTimeout(async () => {
				if (interaction.replied || interaction.deferred) return;
				try {
					await interaction.reply({
						content: "この操作は期限切れです。コマンドを再実行してください。",
						flags: MessageFlags.Ephemeral,
					});
				} catch {
					// コレクターと競合した場合などの応答失敗は無視する
				}
			}, TIMEOUT.ORPHANED_COMPONENT_GRACE);
			return;
		}

		if (!interaction.isChatInputCommand()) return;
		if (!interaction.inCachedGuild()) return;

		try {
			await handleCommand(interaction, ctx);
		} catch (error) {
			console.error("Error handling command:", error);

			const content = "コマンドの実行中にエラーが発生しました。";

			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content });
			} else {
				await interaction.reply({ content, flags: MessageFlags.Ephemeral });
			}
		}
	});
};
