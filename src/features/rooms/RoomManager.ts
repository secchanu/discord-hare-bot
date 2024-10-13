import {
	type Client,
	Collection,
	type Snowflake,
	type VoiceState,
} from "discord.js";
import { Room } from "./Room";
import { RoomStore } from "./RoomStore";
import type { RoomData } from "./types";

/**
 * ルームマネージャー
 */
export class RoomManager {
	private static instance: RoomManager;
	private rooms: Collection<Snowflake, Room>;
	private store: RoomStore;

	private constructor() {
		this.rooms = new Collection();
		this.store = RoomStore.getInstance();
	}

	public static getInstance(): RoomManager {
		if (!RoomManager.instance) {
			RoomManager.instance = new RoomManager();
		}
		return RoomManager.instance;
	}

	/**
	 * ルームを取得
	 */
	get(roomId: Snowflake): Room | undefined {
		return this.rooms.get(roomId);
	}

	/**
	 * 全ルームを取得
	 */
	getAll(): Collection<Snowflake, Room> {
		return this.rooms;
	}

	/**
	 * ルームを作成
	 */
	async createRoom(_oldState: VoiceState, newState: VoiceState): Promise<void> {
		if (!newState.member || !newState.channel) return;

		const guild = newState.guild;
		const owner = newState.member;
		const position =
			newState.channel.parent?.rawPosition ?? newState.channel.rawPosition;

		const room = new Room(guild, {
			hostname: owner.displayName,
			ownerId: owner.id,
			position,
		});

		try {
			const roomId = await room.create(position);

			// メモリに保存
			this.rooms.set(roomId, room);

			// 永続化
			await this.store.set(roomId, room.toData());

			// オーナーを作成したルームのボイスチャンネルに移動
			await room.moveMembers(newState);
		} catch (error) {
			console.error("[RoomManager] Failed to create room:", error);
		}
	}

	/**
	 * メンバーの移動を処理
	 */
	async handleMemberMove(
		oldState: VoiceState,
		newState: VoiceState,
	): Promise<void> {
		const oldRoomId = oldState.channel?.parentId;
		const newRoomId = newState.channel?.parentId;

		if (oldRoomId === newRoomId) return;
		if (!newState.member) return;

		// 新しいルームに参加
		if (newRoomId) {
			const newRoom = this.rooms.get(newRoomId);
			if (newRoom) {
				await newRoom.join(newState.member);
			}
		}

		// 古いルームから退出
		if (oldRoomId) {
			const oldRoom = this.rooms.get(oldRoomId);
			if (oldRoom) {
				await oldRoom.leave(newState.member);

				// ルームが空になったら削除
				const deleted = await oldRoom.delete();
				if (deleted) {
					this.rooms.delete(oldRoomId);
					await this.store.delete(oldRoomId);
				}
			}
		}
	}

	/**
	 * Bot再起動時のルーム復旧
	 */
	async recoverRooms(client: Client): Promise<void> {
		console.log("[RoomManager] Recovering guild rooms...");

		try {
			const roomDataList = await this.store.getAll();
			let recoveredCount = 0;
			let failedCount = 0;

			for (const roomData of roomDataList) {
				try {
					await this.recoverSingleRoom(client, roomData);
					recoveredCount++;
				} catch (error) {
					console.error(
						`[RoomManager] Failed to recover room ${roomData.id}:`,
						error,
					);
					failedCount++;
					// 復旧できないルームは削除
					await this.store.delete(roomData.id);
				}
			}

			console.log(
				`[RoomManager] Room recovery complete: ${recoveredCount} recovered, ${failedCount} failed`,
			);
		} catch (error) {
			console.error("[RoomManager] Failed to recover rooms:", error);
		}
	}

	/**
	 * 単一ルームの復旧
	 */
	private async recoverSingleRoom(
		client: Client,
		roomData: RoomData,
	): Promise<void> {
		// ギルドを取得
		const guild = client.guilds.cache.get(roomData.guildId);
		if (!guild) {
			throw new Error(`Guild ${roomData.guildId} not found`);
		}

		// チャンネルの存在確認
		const category = guild.channels.cache.get(roomData.channels.categoryId);
		if (!category) {
			throw new Error(`Category ${roomData.channels.categoryId} not found`);
		}

		// ルームを復元
		const room = await Room.fromData(guild, roomData);

		// オーナーがいる場合はゲームオブザーバーを再セットアップ
		if (roomData.ownerId) {
			const owner = guild.members.cache.get(roomData.ownerId);
			if (owner) {
				// setupGameObserverメソッドを公開する必要がある
				// 今回は省略
			}
		}

		// メモリに保存
		this.rooms.set(roomData.id, room);
	}
}
