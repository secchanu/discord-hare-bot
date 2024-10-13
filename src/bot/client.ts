import { Client } from "discord.js";
import { intents } from "./intents";

/**
 * Discord Client のシングルトンインスタンス
 * Discord.js の Client をそのまま使用
 */
export const client = new Client({ intents });

/**
 * Client の初期化とログイン
 */
export const initializeClient = async (token: string): Promise<void> => {
	if (!token) {
		throw new Error("Bot token is required");
	}

	await client.login(token);
};
