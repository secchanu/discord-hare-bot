import type { Role } from "discord.js";
import type { AppContext } from "../../bot/context";
import { ROOM_ONLY_MESSAGE, replyError } from "../helpers";
import { getGameRoleError, INVALID_GAME_ROLE_MESSAGE } from "../helpers/game";
import { getRoomFromTextChannel } from "../helpers/room";
import type { GuildCommandInteraction } from "../types";

/**
 * /room game サブコマンド
 * ルームのゲームを変更する
 */
export async function handleGame(
	interaction: GuildCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	const room = getRoomFromTextChannel(interaction, ctx.roomManager);
	if (!room) {
		await replyError(interaction, ROOM_ONLY_MESSAGE);
		return;
	}

	// @everyone は changeGame がデフォルトゲームに変換する
	const role = interaction.options.getRole("game", true) as Role;
	const roleError = getGameRoleError(interaction, role, ctx);
	if (roleError) {
		await replyError(interaction, roleError);
		return;
	}

	// ゲームの変更は保存を伴い、最初の応答の期限（3秒）を超え得るため、先に応答を保留する
	await interaction.deferReply();

	const setGame = await ctx.roomManager.changeGame(room, role.id);
	if (!setGame) {
		await replyError(interaction, INVALID_GAME_ROLE_MESSAGE);
		return;
	}

	await interaction.editReply(`ゲームを「${setGame.name}」に変更しました`);
}
