import type { Guild } from "discord.js";
import type { AppContext } from "../bot/context";
import { callCommand } from "./call";
import { gameCommand } from "./game";
import { replyError } from "./helpers";
import { randCommand } from "./rand";
import { roomCommand } from "./room";
import { teamCommand } from "./team";
import type { CommandHandler, GuildCommandInteraction } from "./types";

/**
 * すべてのコマンド
 */
const commands: Map<string, CommandHandler> = new Map([
	["room", roomCommand],
	["team", teamCommand],
	["call", callCommand],
	["rand", randCommand],
	["game", gameCommand],
]);

/**
 * コマンドを Discord に登録する
 * 1つのサーバーだけで運用するため、即時に反映されるギルドコマンドとして登録する
 */
export async function registerCommands(guild: Guild): Promise<void> {
	const commandData = Array.from(commands.values()).map((cmd) => cmd.data);

	await guild.commands.set(commandData);
	console.log(`Registered ${commandData.length} commands to guild ${guild.id}`);
}

/**
 * コマンドを実行する
 */
export async function handleCommand(
	interaction: GuildCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	const command = commands.get(interaction.commandName);

	if (!command) {
		await replyError(interaction, "不明なコマンドです");
		return;
	}

	await command.execute(interaction, ctx);
}
