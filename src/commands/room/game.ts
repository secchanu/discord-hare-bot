import type { ChatInputCommandInteraction, Role } from "discord.js";
import { config } from "../../bot/config";
import { RoomStore } from "../../features/rooms/RoomStore";
import { hasRoleManager } from "../../types/guards";
import { isGuildInteraction } from "../helpers";
import { getRoomFromTextChannel } from "../helpers/room";

/**
 * /room game サブコマンド
 * ルームのゲーム設定
 */
export async function handleGame(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!isGuildInteraction(interaction)) {
		await interaction.reply({
			content: "このコマンドはサーバー内でのみ使用できます。",
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply();

	const room = getRoomFromTextChannel(interaction);
	if (!room) {
		await interaction.editReply("このコマンドはルーム内でのみ使用できます。");
		return;
	}

	const role = interaction.options.getRole("game", true) as Role;
	const roleId = role.id;

	// 無効なロールチェック（ignoreロールのみ、@everyoneはsetGameで変換される）
	if (config.ignoreRoleIds.includes(roleId)) {
		await interaction.editReply("このロールはゲームとして選択できません");
		return;
	}

	// メンバーがロールを持っているかチェック
	if (
		!hasRoleManager(interaction.member) ||
		!interaction.member.roles.cache.has(roleId)
	) {
		await interaction.editReply(
			"このゲームは付与されていないため選択できません\n先に<id:customize>からプレイするゲームとして選択してください",
		);
		return;
	}

	const setGame = await room.setGame(roleId);
	if (!setGame) {
		await interaction.editReply("このロールはゲームとして選択できません");
		return;
	}

	// 永続化データも更新
	if (room.id) {
		const roomStore = RoomStore.getInstance();
		await roomStore.set(room.id, room.toData());
	}

	await interaction.editReply(`ゲームを「${setGame.name}」に変更しました`);
}
