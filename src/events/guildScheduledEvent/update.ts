import type {
	Client,
	GuildScheduledEvent,
	PartialGuildScheduledEvent,
} from "discord.js";
import { Events } from "discord.js";
import { EventRoomManager } from "../../features/events/EventRoomManager";

/**
 * Guild Scheduled Event 更新時の処理
 * Discord.js の GuildScheduledEventUpdate イベントハンドラー
 */
export const setupGuildScheduledEventUpdateHandler = (client: Client): void => {
	client.on(
		Events.GuildScheduledEventUpdate,
		async (
			oldEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
			newEvent: GuildScheduledEvent,
		) => {
			const eventManager = EventRoomManager.getInstance();
			await eventManager.updateEventRoom(oldEvent, newEvent);
		},
	);
};
