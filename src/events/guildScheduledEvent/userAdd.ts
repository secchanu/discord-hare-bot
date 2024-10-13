import type {
	Client,
	GuildScheduledEvent,
	PartialGuildScheduledEvent,
	User,
} from "discord.js";
import { Events } from "discord.js";
import { EventRoomManager } from "../../features/events/EventRoomManager";

/**
 * Guild Scheduled Event ユーザー追加時の処理
 * Discord.js の GuildScheduledEventUserAdd イベントハンドラー
 */
export const setupGuildScheduledEventUserAddHandler = (
	client: Client,
): void => {
	client.on(
		Events.GuildScheduledEventUserAdd,
		async (
			event: GuildScheduledEvent | PartialGuildScheduledEvent,
			user: User,
		) => {
			const eventManager = EventRoomManager.getInstance();
			await eventManager.addUserToEventRoom(event, user);
		},
	);
};
