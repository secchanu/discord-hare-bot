import { GatewayIntentBits } from "discord.js";

/**
 * Bot が購読するゲートウェイインテント
 * 募集メッセージはメンションだけで判定するため、GuildMessages で足りる
 */
export const intents = [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildVoiceStates,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.GuildScheduledEvents,
] as const;
