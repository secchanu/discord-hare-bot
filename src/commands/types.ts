import type {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { AppContext } from "../bot/context";

/**
 * サーバー内で実行されたスラッシュコマンド
 * コマンドはギルドコマンドとして登録するため、サーバー内からだけ届く
 */
export type GuildCommandInteraction = ChatInputCommandInteraction<"cached">;

/**
 * スラッシュコマンドの定義と処理
 */
export interface CommandHandler {
	data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
	execute: (interaction: GuildCommandInteraction, ctx: AppContext) => Promise<void>;
}
