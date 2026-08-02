import type { Client, GuildScheduledEvent, PartialGuildScheduledEvent, User } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * Guild Scheduled Event ユーザー削除時の処理
 * Discord.js の GuildScheduledEventUserRemove イベントハンドラー
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
