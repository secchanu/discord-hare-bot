import type { Client } from "discord.js";
import type { AppContext } from "../bot/context";
import { setupGuildScheduledEventCreateHandler } from "./guildScheduledEvent/create";
import { setupGuildScheduledEventDeleteHandler } from "./guildScheduledEvent/delete";
import { setupGuildScheduledEventUpdateHandler } from "./guildScheduledEvent/update";
import { setupGuildScheduledEventUserAddHandler } from "./guildScheduledEvent/userAdd";
import { setupGuildScheduledEventUserRemoveHandler } from "./guildScheduledEvent/userRemove";
import { setupInteractionCreateHandler } from "./interactionCreate";
import { setupMessageCreateHandler } from "./messageCreate";
import { setupReadyHandler } from "./ready";
import { setupVoiceStateUpdateHandler } from "./voiceStateUpdate";

/**
 * 全てのイベントハンドラーを登録
 */
export const registerEventHandlers = (client: Client, ctx: AppContext): void => {
	// Core events
	setupReadyHandler(client, ctx);
	setupInteractionCreateHandler(client, ctx);
	setupVoiceStateUpdateHandler(client, ctx);
	setupMessageCreateHandler(client, ctx);

	// Guild Scheduled Event handlers
	setupGuildScheduledEventCreateHandler(client, ctx);
	setupGuildScheduledEventUpdateHandler(client, ctx);
	setupGuildScheduledEventDeleteHandler(client, ctx);
	setupGuildScheduledEventUserAddHandler(client, ctx);
	setupGuildScheduledEventUserRemoveHandler(client, ctx);
};
