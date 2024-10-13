import { GatewayIntentBits } from "discord.js";

/**
 * Bot に必要な Gateway Intents
 */
export const intents = [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildVoiceStates,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.GuildScheduledEvents,
	GatewayIntentBits.GuildPresences,
] as const;
