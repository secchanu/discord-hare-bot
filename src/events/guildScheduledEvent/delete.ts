import type {
	Client,
	GuildScheduledEvent,
	PartialGuildScheduledEvent,
} from "discord.js";
import { Events } from "discord.js";
import { EventRoomManager } from "../../features/events/EventRoomManager";

/**
 * Guild Scheduled Event 削除時の処理
 * Discord.js の GuildScheduledEventDelete イベントハンドラー
 */
export const setupGuildScheduledEventDeleteHandler = (client: Client): void => {
	client.on(
		Events.GuildScheduledEventDelete,
		async (event: GuildScheduledEvent | PartialGuildScheduledEvent) => {
			const eventManager = EventRoomManager.getInstance();
			await eventManager.deleteEventRoom(event);
		},
	);
};
