import { SlashCommandBuilder } from "discord.js";
import type { CommandHandler } from "../types";
import { handleData } from "./data";

/**
 * /game コマンド
 * ゲーム設定関連のサブコマンド
 */
export const gameCommand: CommandHandler = {
	data: new SlashCommandBuilder()
		.setName("game")
		.setDescription("ゲームの設定")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("data")
				.setDescription("ゲームデータの編集")
				.addRoleOption((option) =>
					option.setName("game").setDescription("ゲーム").setRequired(true),
				),
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		switch (subcommand) {
			case "data":
				await handleData(interaction);
				break;
		}
	},
};
