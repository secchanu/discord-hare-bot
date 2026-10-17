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

/**
 * ゲームの質問に答えるときに加えるゲートウェイインテント
 * 質問の返信先の本文を読むために使う
 * Bot をメンションしていないメッセージの本文は、MessageContent インテントで届く
 */
export const assistantIntents = [GatewayIntentBits.MessageContent] as const;
