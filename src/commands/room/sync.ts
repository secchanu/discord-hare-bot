import type { ChatInputCommandInteraction } from "discord.js";
import { getRoomFromTextChannel } from "../helpers/room";

/**
 * /room sync サブコマンド
 * 専用チャットの権限同期
 */
export async function handleSync(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const room = getRoomFromTextChannel(interaction);
	if (!room) {
		await interaction.editReply("このコマンドはルーム内でのみ使用できます。");
		return;
	}

	await interaction.editReply("専用チャットの権限を同期しています…");

	try {
		await room.syncTextChannelPermissions();
		await interaction.editReply("専用チャットを部屋のメンバーに同期しました");
	} catch (error) {
		console.error("Failed to sync text channel:", error);
		await interaction.editReply("同期中にエラーが発生しました。");
	}
}
