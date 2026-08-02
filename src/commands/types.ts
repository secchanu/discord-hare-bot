import type {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { AppContext } from "../bot/context";

/**
 * Discord.js コマンドハンドラーのインターフェース
 */
export interface CommandHandler {
	data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
	execute: (interaction: ChatInputCommandInteraction, ctx: AppContext) => Promise<void>;
}
