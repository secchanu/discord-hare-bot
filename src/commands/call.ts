import { SlashCommandBuilder } from "discord.js";
import { MOVE_FAILED_MESSAGE, ROOM_ONLY_MESSAGE, replyError } from "./helpers";
import { getRoomFromVoiceAndTextChannel } from "./helpers/room";
import type { CommandHandler } from "./types";

/**
 * /call コマンド
 * ルームのメンバー全員を1つのボイスチャンネルに集める
 */
export const callCommand: CommandHandler = {
	data: new SlashCommandBuilder()
		.setName("call")
		.setDescription("メンバー全員を1つのVCに集合させる")
		.addIntegerOption((option) =>
			option
				.setName("number")
				.setDescription("移動先VC（指定無しの場合一番上のVC）")
				.setMinValue(0),
		),

	async execute(interaction, ctx) {
		const room = getRoomFromVoiceAndTextChannel(interaction, ctx.roomManager);
		if (!room) {
			await replyError(interaction, ROOM_ONLY_MESSAGE);
			return;
		}

		// 0 はメインのボイスチャンネル、1 以降は追加ボイスチャンネルを表す
		const targetIndex = interaction.options.getInteger("number") ?? 0;
		const maxIndex = room.additionalVoiceChannelCount;
		if (targetIndex > maxIndex) {
			await replyError(
				interaction,
				`${targetIndex}番のVCはありません（0〜${maxIndex}で指定してください）`,
			);
			return;
		}

		await interaction.deferReply();

		const moved = await room.callMembers(targetIndex);
		if (!moved) {
			await replyError(interaction, MOVE_FAILED_MESSAGE);
			return;
		}
		await interaction.editReply("メンバーを集合させました");
	},
};
