import { Events } from "discord.js";
import type { Client } from "discord.js";

import { deleteGame } from "./manager";
import { interactionHandler } from "./command";

//設定の読み込み
import config from "../config";

/**
 * Game機能の有効化
 */
export const enableGame = (client: Client) => {
	if (!config.useGame) return;
	client.on(Events.GuildRoleDelete, deleteGame);
	client.on(Events.InteractionCreate, interactionHandler);
};
