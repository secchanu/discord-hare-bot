import type { Client } from "discord.js";
import { setupGuildScheduledEventCreateHandler } from "./guildScheduledEvent/create";
import { setupGuildScheduledEventDeleteHandler } from "./guildScheduledEvent/delete";
import { setupGuildScheduledEventUpdateHandler } from "./guildScheduledEvent/update";
import { setupGuildScheduledEventUserAddHandler } from "./guildScheduledEvent/userAdd";
import { setupGuildScheduledEventUserRemoveHandler } from "./guildScheduledEvent/userRemove";
import { setupInteractionCreateHandler } from "./interactionCreate";
import { setupReadyHandler } from "./ready";
import { setupVoiceStateUpdateHandler } from "./voiceStateUpdate";

/**
 * 全てのイベントハンドラーを登録
 */
export const registerEventHandlers = (client: Client): void => {
	// Core events
	setupReadyHandler(client);
	setupInteractionCreateHandler(client);
	setupVoiceStateUpdateHandler(client);

	// Guild Scheduled Event handlers
	setupGuildScheduledEventCreateHandler(client);
	setupGuildScheduledEventUpdateHandler(client);
	setupGuildScheduledEventDeleteHandler(client);
	setupGuildScheduledEventUserAddHandler(client);
	setupGuildScheduledEventUserRemoveHandler(client);
};
