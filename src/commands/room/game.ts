import { type ChatInputCommandInteraction, MessageFlags, type Role } from "discord.js";
import type { AppContext } from "../../bot/context";
import { GUILD_ONLY_MESSAGE, isGuildInteraction, ROOM_ONLY_MESSAGE } from "../helpers";
import { getGameRoleError, INVALID_GAME_ROLE_MESSAGE } from "../helpers/game";
import { getRoomFromTextChannel } from "../helpers/room";

/**
 * /room game サブコマンド
 * ルームのゲーム設定
 */
export async function handleGame(
	interaction: ChatInputCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	if (!isGuildInteraction(interaction)) {
		await interaction.reply({ content: GUILD_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
		return;
	}

	await interaction.deferReply();

	const room = getRoomFromTextChannel(interaction, ctx.roomManager);
	if (!room) {
		await interaction.editReply(ROOM_ONLY_MESSAGE);
		return;
	}

	// @everyone は changeGame がデフォルトゲームに変換する
	const role = interaction.options.getRole("game", true) as Role;
	const roleError = getGameRoleError(interaction, role, ctx);
	if (roleError) {
		await interaction.editReply(roleError);
		return;
	}

	const setGame = await ctx.roomManager.changeGame(room, role.id);
	if (!setGame) {
		await interaction.editReply(INVALID_GAME_ROLE_MESSAGE);
		return;
	}

	await interaction.editReply(`ゲームを「${setGame.name}」に変更しました`);
}
