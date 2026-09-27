import type { Client, VoiceState } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../bot/context";

/**
 * ボイスチャンネルの接続状態の変化時に、ルームの作成とメンバーの出入りを処理する
 */
export const setupVoiceStateUpdateHandler = (client: Client, ctx: AppContext): void => {
	client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
		try {
			if (newState.channelId === ctx.config.readyChannelId) {
				await ctx.roomManager.createRoom(newState);
			}

			await ctx.roomManager.handleMemberMove(oldState, newState);
		} catch (error) {
			console.error("[VoiceStateUpdate] Failed to handle voice state update:", error);
		}
	});
};
