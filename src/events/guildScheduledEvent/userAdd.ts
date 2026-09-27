import type { Client, GuildScheduledEvent, PartialGuildScheduledEvent, User } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * スケジュールイベントへの参加登録時に、登録したユーザーに専用チャットを見せる
 */
export const setupGuildScheduledEventUserAddHandler = (client: Client, ctx: AppContext): void => {
	client.on(
		Events.GuildScheduledEventUserAdd,
		async (event: GuildScheduledEvent | PartialGuildScheduledEvent, user: User) => {
			await ctx.eventRoomManager.addUserToEventRoom(event, user);
		},
	);
};
