import { type ChatInputCommandInteraction, type Guild, MessageFlags } from "discord.js";
import type { AppContext } from "../bot/context";
import { callCommand } from "./call";
import { gameCommand } from "./game";
import { randCommand } from "./rand";
import { roomCommand } from "./room";
import { teamCommand } from "./team";
import type { CommandHandler } from "./types";

/**
 * 全コマンドの定義
 */
const commands: Map<string, CommandHandler> = new Map([
	["room", roomCommand],
	["team", teamCommand],
	["call", callCommand],
	["rand", randCommand],
	["game", gameCommand],
]);

/**
 * コマンドを Discord に登録
 * 単一ギルド運用のため、即時反映されるギルドコマンドとして登録する
 */
export async function registerCommands(guild: Guild): Promise<void> {
	const commandData = Array.from(commands.values()).map((cmd) => cmd.data);

	await guild.commands.set(commandData);
	console.log(`Registered ${commandData.length} commands to guild ${guild.id}`);
}

/**
 * コマンドを実行
 */
export async function handleCommand(
	interaction: ChatInputCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	const command = commands.get(interaction.commandName);

	if (!command) {
		await interaction.reply({
			content: "不明なコマンドです。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await command.execute(interaction, ctx);
}
