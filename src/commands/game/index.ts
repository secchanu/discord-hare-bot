import { SlashCommandBuilder } from "discord.js";
import type { CommandHandler } from "../types";
import { handleEdit } from "./edit";
import { handlePick } from "./pick";

/**
 * /game コマンド
 * ゲーム固有データを扱うサブコマンドをまとめる
 */
export const gameCommand: CommandHandler = {
	data: new SlashCommandBuilder()
		.setName("game")
		.setDescription("ゲーム固有データ")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("edit")
				.setDescription("編集する")
				.addRoleOption((option) =>
					option.setName("game").setDescription("ゲーム").setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand.setName("pick").setDescription("ルームのゲームのデータからランダムに選ぶ"),
		),

	async execute(interaction, ctx) {
		const subcommand = interaction.options.getSubcommand();

		switch (subcommand) {
			case "edit":
				await handleEdit(interaction, ctx);
				break;
			case "pick":
				await handlePick(interaction, ctx);
				break;
		}
	},
};
