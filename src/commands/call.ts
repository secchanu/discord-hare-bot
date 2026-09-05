import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { GUILD_ONLY_MESSAGE, isGuildInteraction, ROOM_ONLY_MESSAGE } from "./helpers";
import { getRoomFromVoiceChannel } from "./helpers/room";
import type { CommandHandler } from "./types";

/**
 * /call コマンド
 * メンバー全員を1つのVCに集合させる
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
		if (!isGuildInteraction(interaction)) {
			await interaction.reply({ content: GUILD_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply();

		const room = getRoomFromVoiceChannel(interaction, ctx.roomManager);
		if (!room) {
			await interaction.editReply(ROOM_ONLY_MESSAGE);
			return;
		}

		const targetIndex = interaction.options.getInteger("number") ?? 0;

		try {
			await room.callMembers(targetIndex);
			await interaction.editReply("メンバーを集合させました");
		} catch (error) {
			console.error("[call] Failed to call members:", error);
			await interaction.editReply("メンバーの移動中にエラーが発生しました");
		}
	},
};
