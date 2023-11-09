import { Events } from "discord.js";
import type { Client } from "discord.js";

import {
	addUser,
	createEvent,
	deleteEvent,
	removeUser,
	updateEvent,
} from "./manager";

//設定の読み込み
import config from "../config";

/**
 * Event機能の有効化
 */
export const enableEvent = (client: Client) => {
	if (!config.useEvent) return;
	client.on(Events.GuildScheduledEventCreate, createEvent);
	client.on(Events.GuildScheduledEventDelete, deleteEvent);
	client.on(Events.GuildScheduledEventUpdate, updateEvent);
	client.on(Events.GuildScheduledEventUserAdd, addUser);
	client.on(Events.GuildScheduledEventUserRemove, removeUser);
};
