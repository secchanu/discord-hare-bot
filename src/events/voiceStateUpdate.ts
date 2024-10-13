import type { Client, VoiceState } from "discord.js";
import { Events } from "discord.js";
import { config } from "../bot/config";
import { RoomManager } from "../features/rooms/RoomManager";

/**
 * ボイスステート更新時の処理
 * Discord.js の VoiceStateUpdate イベントハンドラー
 */
export const setupVoiceStateUpdateHandler = (client: Client): void => {
	client.on(
		Events.VoiceStateUpdate,
		async (oldState: VoiceState, newState: VoiceState) => {
			const roomManager = RoomManager.getInstance();

			// 準備チャンネルへの参加でルーム作成
			if (newState.channelId === config.readyChannelId) {
				await roomManager.createRoom(oldState, newState);
			}

			// ルーム間の移動処理
			await roomManager.handleMemberMove(oldState, newState);
		},
	);
};
