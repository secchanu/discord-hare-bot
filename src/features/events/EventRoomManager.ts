import type {
	GuildScheduledEvent,
	PartialGuildScheduledEvent,
	User,
} from "discord.js";
import { config } from "../../bot/config";
import { Room } from "../rooms/Room";
import { RoomManager } from "../rooms/RoomManager";
import { RoomStore } from "../rooms/RoomStore";

/**
 * Guild Scheduled Event とルーム連携を管理
 */
export class EventRoomManager {
	private static instance: EventRoomManager;
	private roomManager: RoomManager;

	private constructor() {
		this.roomManager = RoomManager.getInstance();
	}

	public static getInstance(): EventRoomManager {
		if (!EventRoomManager.instance) {
			EventRoomManager.instance = new EventRoomManager();
		}
		return EventRoomManager.instance;
	}

	/**
	 * イベント用のルームを作成
	 */
	async createEventRoom(event: GuildScheduledEvent): Promise<void> {
		if (event.channelId !== config.readyChannelId) return;
		if (!event.guild) return;

		const room = new Room(event.guild, {
			hostname: event.name,
			reserved: true,
			eventId: event.id,
			position: event.channel?.parent?.rawPosition,
		});

		try {
			const roomId = await room.create();
			const roomStore = RoomStore.getInstance();

			// イベントのチャンネルをルームのVCに設定
			const voiceChannel = room.voiceChannel;
			if (voiceChannel) {
				await event.edit({ channel: voiceChannel });
			}

			// イベント参加者を追加
			const subscribers = await event.fetchSubscribers();
			await Promise.all(subscribers.map((sub) => room.join(sub.user)));

			// 保存
			this.roomManager.getAll().set(roomId, room);
			await roomStore.set(roomId, room.toData());
		} catch (error) {
			console.error("[EventRoomManager] Failed to create event room:", error);
		}
	}

	/**
	 * イベントルームを削除
	 */
	async deleteEventRoom(
		event: GuildScheduledEvent | PartialGuildScheduledEvent,
	): Promise<void> {
		const parentId = event.channel?.parentId;
		if (!parentId) return;

		const room = this.roomManager.get(parentId);
		if (!room) return;

		room.reserved = false;
		const deleted = await room.delete();

		if (deleted) {
			const { RoomStore } = await import("../rooms/RoomStore.js");
			const roomStore = RoomStore.getInstance();
			this.roomManager.getAll().delete(parentId);
			await roomStore.delete(parentId);
		}
	}

	/**
	 * イベントルームを更新
	 */
	async updateEventRoom(
		oldEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
		newEvent: GuildScheduledEvent,
	): Promise<void> {
		// アクティブなイベントは処理しない
		if (newEvent.isActive()) return;

		// 準備チャンネルから準備チャンネルへの変更は無視
		if (
			oldEvent?.channelId &&
			oldEvent.channelId === config.readyChannelId &&
			newEvent.channelId === config.readyChannelId
		) {
			return;
		}

		// イベント完了時
		if (newEvent.isCompleted()) {
			await this.deleteEventRoom(newEvent);
			return;
		}

		// チャンネルが変更された場合
		if (oldEvent && oldEvent.channel?.parentId !== newEvent.channel?.parentId) {
			await this.deleteEventRoom(oldEvent);
		}

		// 準備チャンネルに設定された場合
		if (newEvent.channelId === config.readyChannelId) {
			await this.createEventRoom(newEvent);
		}
	}

	/**
	 * イベントにユーザーを追加
	 */
	async addUserToEventRoom(
		event: GuildScheduledEvent | PartialGuildScheduledEvent,
		user: User,
	): Promise<void> {
		const parentId = event.channel?.parentId;
		if (!parentId) return;

		const room = this.roomManager.get(parentId);
		if (!room) return;

		await room.join(user);
	}

	/**
	 * イベントからユーザーを削除
	 */
	async removeUserFromEventRoom(
		event: GuildScheduledEvent | PartialGuildScheduledEvent,
		user: User,
	): Promise<void> {
		const parentId = event.channel?.parentId;
		if (!parentId) return;

		const room = this.roomManager.get(parentId);
		if (!room) return;

		await room.leave(user);
	}
}
