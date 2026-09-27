import type { AppContext } from "../../bot/context";
import { ROOM_ONLY_MESSAGE, replyError } from "../helpers";
import { getRoomFromTextChannel } from "../helpers/room";
import type { GuildCommandInteraction } from "../types";

/**
 * /room sync サブコマンド
 * 専用チャットの閲覧権限を、ルームのボイスチャンネルにいるメンバーにそろえる
 */
export async function handleSync(
	interaction: GuildCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	const room = getRoomFromTextChannel(interaction, ctx.roomManager);
	if (!room) {
		await replyError(interaction, ROOM_ONLY_MESSAGE);
		return;
	}

	await interaction.reply("専用チャットの権限を同期しています…");

	try {
		await room.syncTextChannelPermissions();
		await interaction.editReply("専用チャットを部屋のメンバーに同期しました");
	} catch (error) {
		console.error("[room sync] Failed to sync text channel:", error);
		await replyError(interaction, "同期中にエラーが発生しました");
	}
}
