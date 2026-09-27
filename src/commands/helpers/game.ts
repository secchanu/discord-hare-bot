import type { Role } from "discord.js";
import type { AppContext } from "../../bot/context";
import type { GuildCommandInteraction } from "../types";

export const INVALID_GAME_ROLE_MESSAGE = "このロールはゲームとして選択できません";

/**
 * ロールをゲームとして選択できない理由を返す
 * ゲームとして選択できるのは、除外ロール以外で実行者が持っているロール
 * @returns 選択できない理由のメッセージ。選択できる場合は null
 */
export function getGameRoleError(
	interaction: GuildCommandInteraction,
	role: Role,
	ctx: AppContext,
): string | null {
	if (ctx.config.ignoreRoleIds.includes(role.id)) {
		return INVALID_GAME_ROLE_MESSAGE;
	}

	if (!interaction.member.roles.cache.has(role.id)) {
		return "このゲームは付与されていないため選択できません\n先に<id:customize>からプレイするゲームとして選択してください";
	}

	return null;
}
