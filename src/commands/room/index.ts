import { SlashCommandBuilder } from "discord.js";
import { DISCORD_LIMITS } from "../../constants";
import type { CommandHandler } from "../types";
import { handleGame } from "./game";
import { handleSync } from "./sync";
import { handleVc } from "./vc";

/**
 * /room コマンド
 * ルーム管理関連のサブコマンド
 */
export const roomCommand: CommandHandler = {
	data: new SlashCommandBuilder()
		.setName("room")
		.setDescription("部屋の設定")
		.addSubcommand((subcommand) =>
			subcommand.setName("sync").setDescription("専用チャットの同期"),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("vc")
				.setDescription(
					`追加VC数の変更（${DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS}個まで）`,
				)
				.addIntegerOption((option) =>
					option
						.setName("number")
						.setDescription("VC数（指定無しの場合無し）")
						.setMinValue(0)
						.setMaxValue(DISCORD_LIMITS.MAX_ADDITIONAL_VOICE_CHANNELS),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("game")
				.setDescription("ゲームの変更")
				.addRoleOption((option) =>
					option.setName("game").setDescription("ゲーム").setRequired(true),
				),
		),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		switch (subcommand) {
			case "sync":
				await handleSync(interaction);
				break;
			case "vc":
				await handleVc(interaction);
				break;
			case "game":
				await handleGame(interaction);
				break;
		}
	},
};
