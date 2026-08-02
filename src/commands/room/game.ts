import { type ChatInputCommandInteraction, MessageFlags, type Role } from "discord.js";
import type { AppContext } from "../../bot/context";
import { hasRoleManager } from "../../types/guards";
import { isGuildInteraction } from "../helpers";
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
		await interaction.reply({
			content: "このコマンドはサーバー内でのみ使用できます。",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await interaction.deferReply();

	const room = getRoomFromTextChannel(interaction, ctx.roomManager);
	if (!room) {
		await interaction.editReply("このコマンドはルーム内でのみ使用できます。");
		return;
	}

	const role = interaction.options.getRole("game", true) as Role;
	const roleId = role.id;

	// 無効なロールチェック（ignoreロールのみ、@everyoneはchangeGameで変換される）
	if (ctx.config.ignoreRoleIds.includes(roleId)) {
		await interaction.editReply("このロールはゲームとして選択できません");
		return;
	}

	// メンバーがロールを持っているかチェック
	if (!hasRoleManager(interaction.member) || !interaction.member.roles.cache.has(roleId)) {
		await interaction.editReply(
			"このゲームは付与されていないため選択できません\n先に<id:customize>からプレイするゲームとして選択してください",
		);
		return;
	}

	const setGame = await ctx.roomManager.changeGame(room, roleId);
	if (!setGame) {
		await interaction.editReply("このロールはゲームとして選択できません");
		return;
	}

	await interaction.editReply(`ゲームを「${setGame.name}」に変更しました`);
}
