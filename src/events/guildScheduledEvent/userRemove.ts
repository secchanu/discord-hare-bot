import type { Client, GuildScheduledEvent, PartialGuildScheduledEvent } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * スケジュールイベントの参加登録の取り消し時に、イベントのルームの専用チャットの閲覧者をそろえる
 */
export const setupGuildScheduledEventUserRemoveHandler = (
	client: Client,
	ctx: AppContext,
): void => {
	client.on(
		Events.GuildScheduledEventUserRemove,
		async (event: GuildScheduledEvent | PartialGuildScheduledEvent) => {
			await ctx.eventRoomManager.syncEventRoomViewers(event);
		},
	);
};
