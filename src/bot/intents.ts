import { GatewayIntentBits } from "discord.js";

/**
 * Bot に必要な Gateway Intents
 * 募集メッセージの判定はメンション情報のみを使うため MessageContent は不要
 */
export const intents = [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildVoiceStates,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.GuildScheduledEvents,
] as const;
