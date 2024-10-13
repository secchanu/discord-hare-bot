import type { ChatInputCommandInteraction, Client } from "discord.js";
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
 */
export async function registerCommands(client: Client): Promise<void> {
	const commandData = Array.from(commands.values()).map((cmd) => cmd.data);

	try {
		await client.application?.commands.set(commandData);
		console.log(`Registered ${commandData.length} commands`);
	} catch (error) {
		console.error("Failed to register commands:", error);
	}
}

/**
 * コマンドを実行
 */
export async function handleCommand(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	const command = commands.get(interaction.commandName);

	if (!command) {
		await interaction.reply({
			content: "不明なコマンドです。",
			ephemeral: true,
		});
		return;
	}

	await command.execute(interaction);
}
