import { ChannelType } from "discord.js";
import type {
	GuildScheduledEvent,
	GuildScheduledEventStatus,
	PartialGuildScheduledEvent,
	User,
	VoiceBasedChannel,
} from "discord.js";

import { roomMap } from "../manager";
import Room from "../Room";
import GameRoom from "../game/GameRoom";

//設定の読み込み
import config from "../config";

const createEventRoom = async (
	event: GuildScheduledEvent<GuildScheduledEventStatus>,
) => {
	if (!event.guild) return;
	const channelManager = event.guild.channels;
	const eventName = event.name;
	const room = config.useGame
		? new GameRoom(channelManager, eventName)
		: new Room(channelManager, eventName);
	room.reserved = true;
	const position = event.channel?.parent?.rawPosition;
	const key = await room.create(position);
	const parent = channelManager.resolve(`${key}`);
	if (parent?.type === ChannelType.GuildCategory) {
		const channel = parent.children.cache.find((ch): ch is VoiceBasedChannel =>
			ch.isVoiceBased(),
		);
		await event.edit({
			channel: channel,
		});
	}
	const subscribers = await event.fetchSubscribers();
	await Promise.all(subscribers.map(async (sub) => room.join(sub.user)));
	roomMap.set(key, room);
};

const deleteEventRoom = async (
	event:
		| GuildScheduledEvent<GuildScheduledEventStatus>
		| PartialGuildScheduledEvent,
) => {
	const room = roomMap.get(`${event.channel?.parentId}`);
	if (!room) return;
	room.reserved = false;
	const deleted = await room.delete();
	if (!deleted) return;
	roomMap.delete(`${event.channel?.parentId}`);
};

/**
 * Eventの作成
 * Events.GuildScheduledEventCreate
 */
export const createEvent = async (
	event: GuildScheduledEvent<GuildScheduledEventStatus>,
) => {
	if (event.channelId !== config.readyChannelId) return;
	await createEventRoom(event);
};

/**
 * Eventの削除
 * Events.GuildScheduledEventDelete
 */
export const deleteEvent = async (
	event:
		| GuildScheduledEvent<GuildScheduledEventStatus>
		| PartialGuildScheduledEvent,
) => {
	await deleteEventRoom(event);
};

/**
 * Eventの更新
 * Events.GuildScheduledEventUpdate
 */
export const updateEvent = async (
	oldEvent:
		| GuildScheduledEvent<GuildScheduledEventStatus>
		| PartialGuildScheduledEvent
		| null,
	newEvent: GuildScheduledEvent<GuildScheduledEventStatus>,
) => {
	if (newEvent.isActive()) return;
	if (oldEvent?.channelId && oldEvent.channelId === config.readyChannelId)
		return;
	if (newEvent.isCompleted()) {
		await deleteEventRoom(newEvent);
		return;
	}
	if (oldEvent && oldEvent.channel?.parentId !== newEvent.channel?.parentId)
		await deleteEventRoom(oldEvent);
	if (newEvent.channelId === config.readyChannelId)
		await createEventRoom(newEvent);
};

/**
 * Eventに参加
 * Events.GuildScheduledEventUserAdd
 */
export const addUser = async (
	event:
		| GuildScheduledEvent<GuildScheduledEventStatus>
		| PartialGuildScheduledEvent,
	user: User,
) => {
	const room = roomMap.get(`${event.channel?.parentId}`);
	if (!room) return;
	if (room.members.has(user.id)) return;
	await room.join(user);
};

/**
 * Eventから退出
 * Events.GuildScheduledEventUserRemove
 */
export const removeUser = async (
	event:
		| GuildScheduledEvent<GuildScheduledEventStatus>
		| PartialGuildScheduledEvent,
	user: User,
) => {
	const room = roomMap.get(`${event.channel?.parentId}`);
	if (!room) return;
	if (room.members.has(user.id)) return;
	await room.leave(user);
};
