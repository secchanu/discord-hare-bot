import { SlashCommandBuilder } from "discord.js";
import type { CommandHandler } from "../types";
import { handlePick } from "./pick";
import { handleShuffle } from "./shuffle";

/**
 * /member コマンド
 * ボイスチャンネルのメンバーをランダムに扱うサブコマンドをまとめる
 */
export const memberCommand: CommandHandler = {
	data: new SlashCommandBuilder()
		.setName("member")
		.setDescription("ルームのメンバー")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("pick")
				.setDescription("ランダムに選ぶ")
				.addIntegerOption((option) =>
					option.setName("number").setDescription("選択数 (指定無しの場合1人)").setMinValue(1),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand.setName("shuffle").setDescription("ランダムに並び替える"),
		),

	async execute(interaction, ctx) {
		const subcommand = interaction.options.getSubcommand();

		switch (subcommand) {
			case "pick":
				await handlePick(interaction, ctx);
				break;
			case "shuffle":
				await handleShuffle(interaction, ctx);
				break;
		}
	},
};
