import type { VoiceState } from "discord.js";

import Room from "./Room";
import GameRoom from "./game/GameRoom";

//設定の読み込み
import config from "./config";

/**
 * RoomのMap
 */
export const roomMap = new Map<string, Room>();

/**
 * Roomの作成
 */
const createRoom = async (oldState: VoiceState, newState: VoiceState) => {
	if (newState.channelId !== config.readyChannelId) return;
	const channelManager = newState.guild.channels;
	const owner = newState.member;
	const room = config.useGame
		? new GameRoom(channelManager, owner)
		: new Room(channelManager, owner);
	const basePosition =
		newState.channel?.parent?.rawPosition ?? newState.channel?.rawPosition;
	const position = basePosition ? basePosition : undefined;
	const key = await room.create(position);
	roomMap.set(key, room);
	await room.move(newState);
};

/**
 * Roomの更新
 */
const updateRoom = async (oldState: VoiceState, newState: VoiceState) => {
	const oldKey = oldState.channel?.parentId;
	const newKey = newState.channel?.parentId;
	if (oldKey === newKey) return;
	const member = newState.member;
	if (!member) return;
	if (newKey) {
		const newRoom = roomMap.get(`${newKey}`);
		await newRoom?.join(member);
	}
	if (oldKey) {
		const oldRoom = roomMap.get(`${oldKey}`);
		const deleted = await oldRoom?.delete();
		if (deleted) {
			roomMap.delete(`${oldKey}`);
		} else {
			// await oldRoom?.leave(member);
		}
	}
};

/**
 * Roomの管理
 */
export const manager = async (oldState: VoiceState, newState: VoiceState) => {
	createRoom(oldState, newState);
	updateRoom(oldState, newState);
};
