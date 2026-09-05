import type { ChatInputCommandInteraction } from "discord.js";
import type { AppContext } from "../../bot/context";
import { DISCORD_LIMITS } from "../../constants";
import { ROOM_ONLY_MESSAGE } from "../helpers";
import { getRoomFromTextChannel } from "../helpers/room";

/**
 * /room vc サブコマンド
 * 追加VC数の変更
 */
export async function handleVc(
	interaction: ChatInputCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	await interaction.deferReply();

	const room = getRoomFromTextChannel(interaction, ctx.roomManager);
	if (!room) {
		await interaction.editReply(ROOM_ONLY_MESSAGE);
		return;
	}

	const number = interaction.options.getInteger("number") ?? 0;
	const count = Math.max(0, Math.min(number, DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS));

	await interaction.editReply("追加VC数を変更しています…");

	try {
		await room.setAdditionalVoiceChannels(count);
		await interaction.editReply(`追加VC数を${count}に変更しました`);
	} catch (error) {
		console.error("[room vc] Failed to update additional VCs:", error);
		await interaction.editReply("VC数の変更中にエラーが発生しました");
	}
}
