import type { GuildScheduledEvent, PartialGuildScheduledEvent, User } from "discord.js";
import type { BotConfig } from "../../bot/config";
import type { RoomManager } from "../rooms/RoomManager";

/**
 * Guild Scheduled Event とルーム連携を管理
 * ルームの特定は常にイベントIDで行う
 * （Partial イベントやチャンネル削除後でも event.id は必ず取得できるため）
 */
export class EventRoomManager {
	constructor(
		private roomManager: RoomManager,
		private config: BotConfig,
	) {}

	/**
	 * イベント用のルームを作成
	 */
	async createEventRoom(event: GuildScheduledEvent): Promise<void> {
		if (event.channelId !== this.config.readyChannelId) return;
		if (!event.guild) return;

		// 既にこのイベントのルームがある場合は二重作成しない
		if (this.roomManager.findByEventId(event.id)) return;

		try {
			const room = await this.roomManager.createReservedRoom(event.guild, {
				hostname: event.name,
				eventId: event.id,
				position: event.channel?.parent?.rawPosition,
			});

			// イベントのチャンネルをルームのVCに設定
			const voiceChannel = room.voiceChannel;
			if (voiceChannel) {
				await event.edit({ channel: voiceChannel });
			}

			// イベント参加者を追加
			const subscribers = await event.fetchSubscribers();
			await Promise.all(subscribers.map((sub) => room.setTextChannelVisibility(sub.user, true)));
		} catch (error) {
			console.error("[EventRoomManager] Failed to create event room:", error);
		}
	}

	/**
	 * イベントルームを削除
	 */
	async deleteEventRoom(event: GuildScheduledEvent | PartialGuildScheduledEvent): Promise<void> {
		const room = this.roomManager.findByEventId(event.id);
		if (!room) return;

		room.unreserve();
		await this.roomManager.removeRoom(room);
	}

	/**
	 * イベントルームを更新
	 */
	async updateEventRoom(
		_oldEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
		newEvent: GuildScheduledEvent,
	): Promise<void> {
		// アクティブなイベントは処理しない
		if (newEvent.isActive()) return;

		// イベント完了またはキャンセル時
		if (newEvent.isCompleted() || newEvent.isCanceled()) {
			await this.deleteEventRoom(newEvent);
			return;
		}

		const room = this.roomManager.findByEventId(newEvent.id);

		if (room) {
			// createEventRoom 内でイベントのチャンネルをルームVCへ付け替えた直後の
			// update 通知や、ルーム内VCへの変更は無視する
			if (newEvent.channelId && room.hasVoiceChannel(newEvent.channelId)) return;

			// 準備チャンネルに再設定された場合もルームは既に存在するため何もしない
			if (newEvent.channelId === this.config.readyChannelId) return;

			// ルーム外のチャンネルへ変更された場合はルームを解体
			await this.deleteEventRoom(newEvent);
			return;
		}

		// 準備チャンネルに設定された場合はルームを作成
		if (newEvent.channelId === this.config.readyChannelId) {
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
		const room = this.roomManager.findByEventId(event.id);
		if (!room) return;

		await room.setTextChannelVisibility(user, true);
	}

	/**
	 * イベントからユーザーを削除
	 */
	async removeUserFromEventRoom(
		event: GuildScheduledEvent | PartialGuildScheduledEvent,
		user: User,
	): Promise<void> {
		const room = this.roomManager.findByEventId(event.id);
		if (!room) return;

		await room.setTextChannelVisibility(user, false);
	}
}
