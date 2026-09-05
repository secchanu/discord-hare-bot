import type { ChatInputCommandInteraction } from "discord.js";
import type { AppContext } from "../../bot/context";
import { ROOM_ONLY_MESSAGE } from "../helpers";
import { getRoomFromTextChannel } from "../helpers/room";

/**
 * /room sync サブコマンド
 * 専用チャットの権限同期
 */
export async function handleSync(
	interaction: ChatInputCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	await interaction.deferReply();

	const room = getRoomFromTextChannel(interaction, ctx.roomManager);
	if (!room) {
		await interaction.editReply(ROOM_ONLY_MESSAGE);
		return;
	}

	await interaction.editReply("専用チャットの権限を同期しています…");

	try {
		await room.syncTextChannelPermissions();
		await interaction.editReply("専用チャットを部屋のメンバーに同期しました");
	} catch (error) {
		console.error("[room sync] Failed to sync text channel:", error);
		await interaction.editReply("同期中にエラーが発生しました");
	}
}
