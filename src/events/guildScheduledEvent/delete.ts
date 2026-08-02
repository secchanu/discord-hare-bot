import type { Client, GuildScheduledEvent, PartialGuildScheduledEvent } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * Guild Scheduled Event 削除時の処理
 * Discord.js の GuildScheduledEventDelete イベントハンドラー
 */
export const setupGuildScheduledEventDeleteHandler = (client: Client, ctx: AppContext): void => {
	client.on(
		Events.GuildScheduledEventDelete,
		async (event: GuildScheduledEvent | PartialGuildScheduledEvent) => {
			await ctx.eventRoomManager.deleteEventRoom(event);
		},
	);
};
