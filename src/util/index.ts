import { Events } from "discord.js";
import type { Client } from "discord.js";

import { interactionHandler } from "./command";

//設定の読み込み
import config from "./config";

/**
 * Util機能の有効化
 */
export const enableUtil = (client: Client) => {
	if (!config.enable) return;
	client.on(Events.InteractionCreate, interactionHandler);
};
