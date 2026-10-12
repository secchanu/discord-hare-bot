import type { Client, GuildScheduledEvent, PartialGuildScheduledEvent } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * スケジュールイベントへの参加登録時に、イベントのルームの専用チャットの閲覧者をそろえる
 */
export const setupGuildScheduledEventUserAddHandler = (client: Client, ctx: AppContext): void => {
	client.on(
		Events.GuildScheduledEventUserAdd,
		async (event: GuildScheduledEvent | PartialGuildScheduledEvent) => {
			await ctx.eventRoomManager.syncEventRoomViewers(event);
		},
	);
};
