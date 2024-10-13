import { SlashCommandBuilder } from "discord.js";
import { isGuildInteraction } from "./helpers";
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

	async execute(interaction) {
		if (!isGuildInteraction(interaction)) {
			await interaction.reply({
				content: "このコマンドはサーバー内でのみ使用できます。",
				ephemeral: true,
			});
			return;
		}

		await interaction.deferReply();

		const room = getRoomFromVoiceChannel(interaction);
		if (!room) {
			await interaction.editReply("このコマンドはルーム内でのみ使用できます。");
			return;
		}

		const targetIndex = interaction.options.getInteger("number") ?? 0;

		try {
			await room.callMembers(targetIndex);
			await interaction.editReply("メンバーを集合させました");
		} catch (error) {
			console.error("Failed to call members:", error);
			await interaction.editReply("メンバーの移動中にエラーが発生しました。");
		}
	},
};
