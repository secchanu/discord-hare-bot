import type { Client, GuildScheduledEvent } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * Guild Scheduled Event 作成時の処理
 * Discord.js の GuildScheduledEventCreate イベントハンドラー
 */
export const setupGuildScheduledEventCreateHandler = (client: Client, ctx: AppContext): void => {
	client.on(Events.GuildScheduledEventCreate, async (event: GuildScheduledEvent) => {
		await ctx.eventRoomManager.createEventRoom(event);
	});
};
