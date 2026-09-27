import type { AppContext } from "../../bot/context";
import { ROOM_ONLY_MESSAGE, replyError } from "../helpers";
import { getRoomFromTextChannel } from "../helpers/room";
import type { GuildCommandInteraction } from "../types";

/**
 * /room vc サブコマンド
 * 追加ボイスチャンネルの数を変更する
 */
export async function handleVc(
	interaction: GuildCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	const room = getRoomFromTextChannel(interaction, ctx.roomManager);
	if (!room) {
		await replyError(interaction, ROOM_ONLY_MESSAGE);
		return;
	}

	// 指定できる範囲はコマンドの定義で制限する
	const count = interaction.options.getInteger("number") ?? 0;

	await interaction.reply("追加VC数を変更しています…");

	try {
		await room.setAdditionalVoiceChannels(count);
		await interaction.editReply(`追加VC数を${count}に変更しました`);
	} catch (error) {
		console.error("[room vc] Failed to update additional VCs:", error);
		await replyError(interaction, "VC数の変更中にエラーが発生しました");
	}
}
