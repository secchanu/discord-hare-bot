import type { Client, GuildScheduledEvent, PartialGuildScheduledEvent } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * Guild Scheduled Event 更新時の処理
 * Discord.js の GuildScheduledEventUpdate イベントハンドラー
 */
export const setupGuildScheduledEventUpdateHandler = (client: Client, ctx: AppContext): void => {
	client.on(
		Events.GuildScheduledEventUpdate,
		async (
			oldEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
			newEvent: GuildScheduledEvent,
		) => {
			await ctx.eventRoomManager.updateEventRoom(oldEvent, newEvent);
		},
	);
};
