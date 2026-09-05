import type { ChatInputCommandInteraction, Role } from "discord.js";
import type { AppContext } from "../../bot/context";
import { hasRoleManager } from "../../types/guards";

export const INVALID_GAME_ROLE_MESSAGE = "このロールはゲームとして選択できません";

/**
 * ロールをゲームとして選択できない理由を返す
 * 除外ロールは選択できず、実行者が持っていないロールも選択できない
 * @returns 選択できない理由のメッセージ。選択できる場合は null
 */
export function getGameRoleError(
	interaction: ChatInputCommandInteraction<"cached">,
	role: Role,
	ctx: AppContext,
): string | null {
	if (ctx.config.ignoreRoleIds.includes(role.id)) {
		return INVALID_GAME_ROLE_MESSAGE;
	}

	if (!hasRoleManager(interaction.member) || !interaction.member.roles.cache.has(role.id)) {
		return "このゲームは付与されていないため選択できません\n先に<id:customize>からプレイするゲームとして選択してください";
	}

	return null;
}
