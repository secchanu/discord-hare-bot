import type { ChatInputCommandInteraction } from "discord.js";
import type { Room } from "../../features/rooms/Room";
import type { RoomManager } from "../../features/rooms/RoomManager";
import { hasRoleManager } from "../../types/guards";

/**
 * ルーム内のボイスチャンネルに接続しているかチェック
 */
export function getRoomFromVoiceChannel(
	interaction: ChatInputCommandInteraction,
	roomManager: RoomManager,
): Room | null {
	if (
		!interaction.member ||
		!hasRoleManager(interaction.member) ||
		!interaction.member.voice.channel ||
		!interaction.member.voice.channel.parentId
	) {
		return null;
	}

	return roomManager.get(interaction.member.voice.channel.parentId) ?? null;
}

/**
 * ルーム内のテキストチャンネルから実行されているかチェック
 */
export function getRoomFromTextChannel(
	interaction: ChatInputCommandInteraction,
	roomManager: RoomManager,
): Room | null {
	if (
		!interaction.channel ||
		!("parentId" in interaction.channel) ||
		!interaction.channel.parentId
	) {
		return null;
	}

	return roomManager.get(interaction.channel.parentId) ?? null;
}
