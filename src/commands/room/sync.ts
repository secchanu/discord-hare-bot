import type { AppContext } from "../../bot/context";
import { ROOM_ONLY_MESSAGE, replyError } from "../helpers";
import { getRoomFromTextChannel } from "../helpers/room";
import type { GuildCommandInteraction } from "../types";

/**
 * /room sync サブコマンド
 * 専用チャットの閲覧者を、ルームのボイスチャンネルにいるメンバー（イベントが有効な間は参加登録者も）に絞り直す
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
		await room.resetViewers();
		await interaction.editReply("専用チャットを部屋のメンバーに同期しました");
	} catch (error) {
		console.error("[room sync] Failed to sync text channel:", error);
		await replyError(interaction, "同期中にエラーが発生しました");
	}
}
