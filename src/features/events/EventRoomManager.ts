import type { GuildScheduledEvent, PartialGuildScheduledEvent } from "discord.js";
import type { BotConfig } from "../../bot/config";
import type { RoomManager } from "../rooms/RoomManager";

/**
 * スケジュールイベントとルームの連携を管理する
 * Partial のイベントやチャンネルの削除後でもイベントIDは取得できるため、ルームはイベントIDで特定する
 */
export class EventRoomManager {
	constructor(
		private roomManager: RoomManager,
		private config: BotConfig,
	) {}

	/**
	 * 準備チャンネルを場所にしたイベントのルームを作成する
	 */
	async createEventRoom(event: GuildScheduledEvent): Promise<void> {
		if (event.channelId !== this.config.readyChannelId) return;
		if (!event.guild) return;

		// イベントの作成が重複して届いても、ルームは1つだけ作る
		if (this.roomManager.findByEventId(event.id)) return;

		try {
			const room = await this.roomManager.createReservedRoom(event.guild, {
				hostname: event.name,
				eventId: event.id,
				position: event.channel?.parent?.rawPosition,
			});

			// イベントの場所をルームのボイスチャンネルに移す
			const voiceChannel = room.voiceChannel;
			if (voiceChannel) {
				await event.edit({ channel: voiceChannel });
			}
		} catch (error) {
			console.error("[EventRoomManager] Failed to create event room:", error);
		}

		// 参加登録者に専用チャットを見せる
		await this.syncEventRoomViewers(event);
	}

	/**
	 * イベントのルームの予約を解除し、誰もいなければ削除する
	 */
	async deleteEventRoom(event: GuildScheduledEvent | PartialGuildScheduledEvent): Promise<void> {
		const room = this.roomManager.findByEventId(event.id);
		if (!room) return;

		room.unreserve();
		await this.roomManager.removeRoom(room);
	}

	/**
	 * イベントのルームを、イベントの状態と場所に合わせる
	 */
	async updateEventRoom(
		_oldEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
		newEvent: GuildScheduledEvent,
	): Promise<void> {
		// 開始されたイベントのルームはそのまま使う
		if (newEvent.isActive()) return;

		if (newEvent.isCompleted() || newEvent.isCanceled()) {
			await this.deleteEventRoom(newEvent);
			return;
		}

		const room = this.roomManager.findByEventId(newEvent.id);

		if (room) {
			// 場所がルームのボイスチャンネルなら、ルームをそのまま使う
			// createEventRoom が場所を移したときの更新通知もここに当たる
			if (newEvent.channelId && room.hasVoiceChannel(newEvent.channelId)) return;

			// 場所を準備チャンネルに戻しても、既存のルームを使う
			if (newEvent.channelId === this.config.readyChannelId) return;

			await this.deleteEventRoom(newEvent);
			return;
		}

		if (newEvent.channelId === this.config.readyChannelId) {
			await this.createEventRoom(newEvent);
		}
	}

	/**
	 * イベントのルームの専用チャットの閲覧者をそろえる
	 */
	async syncEventRoomViewers(
		event: GuildScheduledEvent | PartialGuildScheduledEvent,
	): Promise<void> {
		const room = this.roomManager.findByEventId(event.id);
		if (room) await this.roomManager.syncViewers(room);
	}
}
