import { Events } from "discord.js";
import type { Client } from "discord.js";

import { commands as roomCommands } from "./room/command";
import { commands as utilCommands } from "./util/command";

/**
 * コマンドの登録
 */
export const setCommands = (client: Client) => {
	client.once(Events.ClientReady, () => {
		client.application?.commands.set([...roomCommands, ...utilCommands]);
	});
};
