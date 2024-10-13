import { SlashCommandBuilder } from "discord.js";
import type { CommandHandler } from "../types";
import { handleData } from "./data";
import { handleMember } from "./member";

/**
 * /rand コマンド
 * ランダム選択関連のサブコマンド
 */
export const randCommand: CommandHandler = {
	data: new SlashCommandBuilder()
		.setName("rand")
		.setDescription("ランダム")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("member")
				.setDescription("部屋のメンバーから")
				.addIntegerOption((option) =>
					option
						.setName("number")
						.setDescription("選択数 (指定無しの場合1人)")
						.setMinValue(1),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand.setName("data").setDescription("ゲーム固有データから"),
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		switch (subcommand) {
			case "member":
				await handleMember(interaction);
				break;
			case "data":
				await handleData(interaction);
				break;
		}
	},
};
