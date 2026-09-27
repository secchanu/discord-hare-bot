import type { Client, GuildScheduledEvent, PartialGuildScheduledEvent } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * スケジュールイベントの更新時に、イベントのルームを状態と場所に合わせる
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
