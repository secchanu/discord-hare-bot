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
 * すべてのイベントハンドラーを登録する
 */
export const registerEventHandlers = (client: Client, ctx: AppContext): void => {
	// 基本イベント
	setupReadyHandler(client, ctx);
	setupInteractionCreateHandler(client, ctx);
	setupVoiceStateUpdateHandler(client, ctx);
	setupMessageCreateHandler(client, ctx);

	// スケジュールイベント連携
	setupGuildScheduledEventCreateHandler(client, ctx);
	setupGuildScheduledEventUpdateHandler(client, ctx);
	setupGuildScheduledEventDeleteHandler(client, ctx);
	setupGuildScheduledEventUserAddHandler(client, ctx);
	setupGuildScheduledEventUserRemoveHandler(client, ctx);
};
