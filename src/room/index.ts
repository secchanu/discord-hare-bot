import { Events } from "discord.js";
import type { Client } from "discord.js";

import { manager } from "./manager";

//設定の読み込み
import config from "./config";

/**
 * Room機能の有効化
 */
export const enableRoom = (client: Client) => {
	if (!config.enable) return;
	client.on(Events.VoiceStateUpdate, manager);
};
