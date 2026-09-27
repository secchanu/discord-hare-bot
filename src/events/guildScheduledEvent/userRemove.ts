import type { Client, GuildScheduledEvent, PartialGuildScheduledEvent, User } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * スケジュールイベントの参加登録の取り消し時に、取り消したユーザーから専用チャットを隠す
 */
export const setupGuildScheduledEventUserRemoveHandler = (
	client: Client,
	ctx: AppContext,
): void => {
	client.on(
		Events.GuildScheduledEventUserRemove,
		async (event: GuildScheduledEvent | PartialGuildScheduledEvent, user: User) => {
			await ctx.eventRoomManager.removeUserFromEventRoom(event, user);
		},
	);
};
