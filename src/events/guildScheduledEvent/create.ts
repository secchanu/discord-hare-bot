import type { Client, GuildScheduledEvent } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../../bot/context";

/**
 * スケジュールイベントの作成時に、準備チャンネルを場所にしたイベントのルームを作成する
 */
export const setupGuildScheduledEventCreateHandler = (client: Client, ctx: AppContext): void => {
	client.on(Events.GuildScheduledEventCreate, async (event: GuildScheduledEvent) => {
		await ctx.eventRoomManager.createEventRoom(event);
	});
};
