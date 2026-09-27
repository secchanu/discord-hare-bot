import type { Client, Interaction } from "discord.js";
import { Events, MessageFlags } from "discord.js";
import type { AppContext } from "../bot/context";
import { handleCommand } from "../commands";
import { replyError } from "../commands/helpers";
import { TIMEOUT } from "../constants";

/**
 * インタラクションの作成時に、スラッシュコマンドを実行する
 */
export const setupInteractionCreateHandler = (client: Client, ctx: AppContext): void => {
	client.on(Events.InteractionCreate, async (interaction: Interaction) => {
		// コンポーネント操作とモーダル送信は、各コマンドのコレクターが応答する
		// コレクターが終了した後の操作には、猶予を置いて期限切れを返す
		if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
			setTimeout(async () => {
				if (interaction.replied || interaction.deferred) return;
				try {
					await interaction.reply({
						content: "この操作は期限切れです\nコマンドを再実行してください",
						flags: MessageFlags.Ephemeral,
					});
				} catch {
					// 応答の失敗は無視する
				}
			}, TIMEOUT.ORPHANED_COMPONENT_GRACE);
			return;
		}

		if (!interaction.isChatInputCommand()) return;
		if (!interaction.inCachedGuild()) return;

		try {
			await handleCommand(interaction, ctx);
		} catch (error) {
			console.error("[InteractionCreate] Failed to handle command:", error);

			try {
				await replyError(interaction, "コマンドの実行中にエラーが発生しました");
			} catch (notifyError) {
				console.error("[InteractionCreate] Failed to notify error:", notifyError);
			}
		}
	});
};
