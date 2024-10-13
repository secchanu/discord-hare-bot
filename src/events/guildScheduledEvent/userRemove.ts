import type {
	Client,
	GuildScheduledEvent,
	PartialGuildScheduledEvent,
	User,
} from "discord.js";
import { Events } from "discord.js";
import { EventRoomManager } from "../../features/events/EventRoomManager";

/**
 * Guild Scheduled Event ユーザー削除時の処理
 * Discord.js の GuildScheduledEventUserRemove イベントハンドラー
 */
export const setupGuildScheduledEventUserRemoveHandler = (
	client: Client,
): void => {
	client.on(
		Events.GuildScheduledEventUserRemove,
		async (
			event: GuildScheduledEvent | PartialGuildScheduledEvent,
			user: User,
		) => {
			const eventManager = EventRoomManager.getInstance();
			await eventManager.removeUserFromEventRoom(event, user);
		},
	);
};
