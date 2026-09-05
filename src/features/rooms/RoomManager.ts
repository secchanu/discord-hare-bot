import {
	Collection,
	type Guild,
	type GuildMember,
	type Snowflake,
	type VoiceState,
} from "discord.js";
import type { BotConfig } from "../../bot/config";
import { TIMEOUT } from "../../constants";
import type { GameManager } from "../games/GameManager";
import type { Game } from "../games/types";
import { Room } from "./Room";
import type { RoomStore } from "./RoomStore";
import type { RoomHooks } from "./types";

// 初期ゲーム判定で遡る募集メッセージ数
const WANTED_LOOKUP_LIMIT = 50;

/**
 * ルームマネージャー
 * ルームの検索・作成・削除・永続化を一手に引き受ける唯一の窓口
 */
export class RoomManager {
	private rooms = new Collection<Snowflake, Room>();
	private readonly hooks: RoomHooks;

	constructor(
		private store: RoomStore,
		private gameManager: GameManager,
		private config: BotConfig,
	) {
		this.hooks = {
			persist: async (room) => {
				if (!room.id) return;
				await this.store.set(room.id, room.toData());
			},
		};
	}

	/**
	 * ルームを取得
	 */
	get(roomId: Snowflake): Room | undefined {
		return this.rooms.get(roomId);
	}

	/**
	 * スケジュールイベントIDからルームを検索
	 */
	findByEventId(eventId: Snowflake): Room | undefined {
		return this.rooms.find((room) => room.eventId === eventId);
	}

	/**
	 * メンバーが参加しているルームを検索
	 */
	findByMemberId(memberId: Snowflake): Room | undefined {
		return this.rooms.find((room) => room.members.has(memberId));
	}

	/**
	 * ルームを作成（準備チャンネルへの参加時）
	 */
	async createRoom(newState: VoiceState): Promise<void> {
		if (!newState.member || !newState.channel) return;

		const guild = newState.guild;
		const owner = newState.member;
		const position = newState.channel.parent?.rawPosition ?? newState.channel.rawPosition;

		try {
			const game = await this.resolveInitialGame(guild, owner);

			const room = new Room(
				guild,
				{
					hostname: owner.displayName,
					ownerId: owner.id,
					game,
				},
				this.hooks,
			);

			const roomId = await room.create(position);
			this.rooms.set(roomId, room);

			// オーナーを作成したルームのボイスチャンネルに移動
			await room.moveMembers(newState);
		} catch (error) {
			console.error("[RoomManager] Failed to create room:", error);
		}
	}

	/**
	 * イベント用の予約ルームを作成
	 * 失敗時は例外を投げる（呼び出し側でハンドリングする）
	 */
	async createReservedRoom(
		guild: Guild,
		options: { hostname: string; eventId: Snowflake; position?: number },
	): Promise<Room> {
		const room = new Room(
			guild,
			{
				hostname: options.hostname,
				reserved: true,
				eventId: options.eventId,
			},
			this.hooks,
		);

		const roomId = await room.create(options.position);
		this.rooms.set(roomId, room);

		return room;
	}

	/**
	 * ルームのゲームを変更する
	 * ロールの妥当性検証とゲームの解決（必要なら作成）を行う
	 * @returns 設定されたゲーム。無効なロールの場合は null
	 */
	async changeGame(room: Room, roleId: Snowflake): Promise<Game | null> {
		const guild = room.guild;

		// @everyoneの場合はデフォルトゲームを使用
		if (roleId === guild.roles.everyone.id) {
			roleId = this.gameManager.getDefaultGame().id;
		}

		// 同じゲームの場合は処理をスキップ
		if (room.game.id === roleId) return room.game;

		const game = await this.resolveGameForRole(guild, roleId);
		if (!game) return null;

		await room.setGame(game);
		return game;
	}

	/**
	 * ロールIDからゲームを解決する（未登録ならロールから新規作成）
	 */
	private async resolveGameForRole(guild: Guild, roleId: Snowflake): Promise<Game | null> {
		const game = await this.gameManager.getGame(roleId);
		if (game) return game;

		const role = guild.roles.resolve(roleId);
		if (!role || this.config.ignoreRoleIds.includes(roleId)) {
			return null;
		}

		return await this.gameManager.createGame(role);
	}

	/**
	 * オーナーの直近の募集メッセージから初期ゲームを決定する
	 * キャッシュは再起動でクリアされるため、過去メッセージは fetch で取得する
	 */
	private async resolveInitialGame(guild: Guild, owner: GuildMember): Promise<Game> {
		const fallback = this.gameManager.getDefaultGame();

		try {
			const wantedChannel = guild.channels.resolve(this.config.wantedChannelId);
			if (!wantedChannel?.isTextBased()) return fallback;

			// fetch はメッセージを新しい順で返すため find で直近の募集が取れる
			const messages = await wantedChannel.messages.fetch({ limit: WANTED_LOOKUP_LIMIT });
			const lastMessage = messages.find(
				(message) => message.author.id === owner.id && message.mentions.roles.size > 0,
			);
			if (!lastMessage) return fallback;

			const messageAge = Date.now() - (lastMessage.editedAt ?? lastMessage.createdAt).getTime();
			if (messageAge > TIMEOUT.GAME_WANTED_MESSAGE) return fallback;

			const role = lastMessage.mentions.roles.first();
			if (!role || !owner.roles.resolve(role.id)) return fallback;

			return (await this.resolveGameForRole(guild, role.id)) ?? fallback;
		} catch (error) {
			console.error("[RoomManager] Failed to resolve initial game:", error);
			return fallback;
		}
	}

	/**
	 * メンバーの移動を処理
	 */
	async handleMemberMove(oldState: VoiceState, newState: VoiceState): Promise<void> {
		const oldRoomId = oldState.channel?.parentId;
		const newRoomId = newState.channel?.parentId;

		if (oldRoomId === newRoomId) return;
		if (!newState.member) return;

		// 新しいルームに参加
		if (newRoomId) {
			const newRoom = this.rooms.get(newRoomId);
			if (newRoom) {
				await newRoom.setTextChannelVisibility(newState.member, true);
			}
		}

		// 古いルームから退出（空になったら削除）
		if (oldRoomId) {
			const oldRoom = this.rooms.get(oldRoomId);
			if (oldRoom) {
				await this.removeRoom(oldRoom);
			}
		}
	}

	/**
	 * ルームを削除し、成功したらメモリとストアから除去する
	 * @returns 削除されたかどうか（予約中・メンバー在室の場合は false）
	 */
	async removeRoom(room: Room): Promise<boolean> {
		const roomId = room.id;
		const deleted = await room.delete();

		if (deleted && roomId) {
			this.rooms.delete(roomId);
			await this.store.delete(roomId);
		}

		return deleted;
	}

	/**
	 * Bot再起動時のルーム復旧
	 */
	async recoverRooms(guild: Guild): Promise<void> {
		console.log("[RoomManager] Recovering guild rooms...");

		const roomDataList = await this.store.getAll();
		let recoveredCount = 0;
		let failedCount = 0;

		for (const roomData of roomDataList) {
			try {
				if (roomData.guildId !== guild.id) {
					throw new Error(`Room belongs to another guild: ${roomData.guildId}`);
				}

				const category = guild.channels.cache.get(roomData.channels.categoryId);
				if (!category) {
					throw new Error(`Category ${roomData.channels.categoryId} not found`);
				}

				const game =
					(await this.gameManager.getGame(roomData.gameId)) ?? this.gameManager.getDefaultGame();
				const room = Room.fromData(guild, roomData, game, this.hooks);

				this.rooms.set(roomData.id, room);
				recoveredCount++;
			} catch (error) {
				console.error(`[RoomManager] Failed to recover room ${roomData.id}:`, error);
				failedCount++;
				// 復旧できないルームは削除
				await this.store.delete(roomData.id);
			}
		}

		console.log(
			`[RoomManager] Room recovery complete: ${recoveredCount} recovered, ${failedCount} failed`,
		);
	}

	/**
	 * 整合性回復処理
	 * Bot 停止中の退出やイベント通知の取りこぼしはイベント駆動では検知できないため、
	 * 起動時に Discord の現在の状態と照らして残骸を回収する
	 */
	async reconcile(guild: Guild): Promise<void> {
		console.log("[RoomManager] Reconciling rooms...");

		// oxlint-disable-next-line unicorn/no-useless-spread -- removeRoom が反復中に this.rooms を変更するためスナップショットを取る
		for (const room of [...this.rooms.values()]) {
			try {
				// 連携先イベントが消えている・終了している予約ルームは予約を解除
				if (room.reserved && room.eventId) {
					const event = await guild.scheduledEvents.fetch(room.eventId).catch(() => null);
					if (!event || event.isCompleted() || event.isCanceled()) {
						room.unreserve();
					}
				}

				// 空のルームを回収
				await this.removeRoom(room);
			} catch (error) {
				console.error(`[RoomManager] Failed to reconcile room ${room.id}:`, error);
			}
		}

		console.log("[RoomManager] Reconcile complete");
	}
}
