import type { ChatInputCommandInteraction } from "discord.js";
import { DISCORD_LIMITS } from "../../constants";
import { RoomStore } from "../../features/rooms/RoomStore";
import { getRoomFromTextChannel } from "../helpers/room";

/**
 * /room vc サブコマンド
 * 追加VC数の変更
 */
export async function handleVc(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const room = getRoomFromTextChannel(interaction);
	if (!room) {
		await interaction.editReply("このコマンドはルーム内でのみ使用できます。");
		return;
	}

	const number = interaction.options.getInteger("number") ?? 0;
	const count = Math.max(
		0,
		Math.min(number, DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS),
	);

	await interaction.editReply("追加VC数を変更しています…");

	try {
		await room.setAdditionalVoiceChannels(count);

		// 永続化データも更新
		if (room.id) {
			const roomStore = RoomStore.getInstance();
			await roomStore.set(room.id, room.toData());
		}

		await interaction.editReply(`追加VC数を${count}に変更しました`);
	} catch (error) {
		console.error("Failed to update additional VCs:", error);
		await interaction.editReply("VC数の変更中にエラーが発生しました。");
	}
}
