import type { Client, GuildScheduledEvent, PartialGuildScheduledEvent, User } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * Guild Scheduled Event ユーザー追加時の処理
 * Discord.js の GuildScheduledEventUserAdd イベントハンドラー
 */
export const setupGuildScheduledEventUserAddHandler = (client: Client, ctx: AppContext): void => {
	client.on(
		Events.GuildScheduledEventUserAdd,
		async (event: GuildScheduledEvent | PartialGuildScheduledEvent, user: User) => {
			await ctx.eventRoomManager.addUserToEventRoom(event, user);
		},
	);
};
