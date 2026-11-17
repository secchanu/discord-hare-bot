import { SlashCommandBuilder } from "discord.js";
import type { CommandHandler } from "../types";
import { handleCurrent } from "./current";
import { handleRandom } from "./random";

/**
 * /team コマンド
 * メンバーをチームに分け、チームごとのボイスチャンネルへ移動するサブコマンドをまとめる
 */
export const teamCommand: CommandHandler = {
	data: new SlashCommandBuilder()
		.setName("team")
		.setDescription("チーム分け")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("random")
				.setDescription("ランダムに分ける")
				.addIntegerOption((option) =>
					option
						.setName("number")
						.setDescription("チーム数（指定無しの場合2チーム）")
						.setMinValue(2),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand.setName("current").setDescription("今の追加VCの分かれ方をチームにする"),
		),

	async execute(interaction, ctx) {
		const subcommand = interaction.options.getSubcommand();

		switch (subcommand) {
			case "random":
				await handleRandom(interaction, ctx);
				break;
			case "current":
				await handleCurrent(interaction, ctx);
				break;
		}
	},
};
