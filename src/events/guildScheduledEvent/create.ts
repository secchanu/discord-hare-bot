import type { Client, GuildScheduledEvent } from "discord.js";
import { Events } from "discord.js";
import { EventRoomManager } from "../../features/events/EventRoomManager";

/**
 * Guild Scheduled Event 作成時の処理
 * Discord.js の GuildScheduledEventCreate イベントハンドラー
 */
export const setupGuildScheduledEventCreateHandler = (client: Client): void => {
	client.on(
		Events.GuildScheduledEventCreate,
		async (event: GuildScheduledEvent) => {
			const eventManager = EventRoomManager.getInstance();
			await eventManager.createEventRoom(event);
		},
	);
};
