import type { Client, VoiceState } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../bot/context";

/**
 * ボイスステート更新時の処理
 * Discord.js の VoiceStateUpdate イベントハンドラー
 */
export const setupVoiceStateUpdateHandler = (client: Client, ctx: AppContext): void => {
	client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
		try {
			// 準備チャンネルへの参加でルーム作成
			if (newState.channelId === ctx.config.readyChannelId) {
				await ctx.roomManager.createRoom(newState);
			}

			// ルーム間の移動処理
			await ctx.roomManager.handleMemberMove(oldState, newState);
		} catch (error) {
			console.error("[VoiceStateUpdate] Failed to handle voice state update:", error);
		}
	});
};
