import type { Room } from "../../features/rooms/Room";
import type { RoomManager } from "../../features/rooms/RoomManager";
import type { GuildCommandInteraction } from "../types";

/**
 * 実行者が接続しているボイスチャンネルのルームを返す
 */
export function getRoomFromVoiceChannel(
	interaction: GuildCommandInteraction,
	roomManager: RoomManager,
): Room | null {
	const parentId = interaction.member.voice.channel?.parentId;
	if (!parentId) return null;

	return roomManager.get(parentId) ?? null;
}

/**
 * 実行者が接続しているボイスチャンネルと、実行したチャンネルが同じルームにあるとき、そのルームを返す
 * ボイスチャンネルのメンバーを対象にするコマンドで、結果をルームの中だけに出すために使う
 */
export function getRoomFromVoiceAndTextChannel(
	interaction: GuildCommandInteraction,
	roomManager: RoomManager,
): Room | null {
	const room = getRoomFromVoiceChannel(interaction, roomManager);
	if (!room || getRoomFromTextChannel(interaction, roomManager) !== room) return null;
	return room;
}

/**
 * 実行したチャンネルのルームを返す
 */
export function getRoomFromTextChannel(
	interaction: GuildCommandInteraction,
	roomManager: RoomManager,
): Room | null {
	const parentId = interaction.channel?.parentId;
	if (!parentId) return null;

	return roomManager.get(parentId) ?? null;
}
