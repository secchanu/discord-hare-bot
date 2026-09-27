import type { Client, GuildScheduledEvent, PartialGuildScheduledEvent } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * スケジュールイベントの削除時に、イベントのルームの予約を解除する（誰もいなければ削除する）
 */
export const setupGuildScheduledEventDeleteHandler = (client: Client, ctx: AppContext): void => {
	client.on(
		Events.GuildScheduledEventDelete,
		async (event: GuildScheduledEvent | PartialGuildScheduledEvent) => {
			await ctx.eventRoomManager.deleteEventRoom(event);
		},
	);
};
