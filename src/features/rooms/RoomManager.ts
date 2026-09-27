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

// 初期ゲームの判定で遡る募集メッセージの数
const WANTED_LOOKUP_LIMIT = 50;

/**
 * ルームの検索・作成・削除・永続化を一手に引き受ける
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
	 * ルームを取得する
	 */
	get(roomId: Snowflake): Room | undefined {
		return this.rooms.get(roomId);
	}

	/**
	 * スケジュールイベントのIDからルームを探す
	 */
	findByEventId(eventId: Snowflake): Room | undefined {
		return this.rooms.find((room) => room.eventId === eventId);
	}

	/**
	 * メンバーが参加しているルームを探す
	 */
	findByMemberId(memberId: Snowflake): Room | undefined {
		return this.rooms.find((room) => room.members.has(memberId));
	}

	/**
	 * 準備チャンネルに入ったメンバーのルームを作成し、そのボイスチャンネルへ移動する
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

			await room.moveMembers(newState);
		} catch (error) {
			console.error("[RoomManager] Failed to create room:", error);
		}
	}

	/**
	 * イベントのルームを予約済みとして作成する
	 * 作成の失敗は呼び出し側に投げる
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
	 * ロールを検証し、ロールのゲームを解決する（未登録なら作成する）
	 * @returns 設定されたゲーム。無効なロールの場合は null
	 */
	async changeGame(room: Room, roleId: Snowflake): Promise<Game | null> {
		const guild = room.guild;

		// @everyone はデフォルトゲームを表す
		if (roleId === guild.roles.everyone.id) {
			roleId = this.gameManager.getDefaultGame().id;
		}

		if (room.game.id === roleId) return room.game;

		const game = await this.resolveGameForRole(guild, roleId);
		if (!game) return null;

		await room.setGame(game);
		return game;
	}

	/**
	 * ロールのゲームを解決する（未登録ならロールから作成する）
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
	 * メッセージのキャッシュは再起動で消えるため、過去のメッセージは fetch で取得する
	 */
	private async resolveInitialGame(guild: Guild, owner: GuildMember): Promise<Game> {
		const fallback = this.gameManager.getDefaultGame();

		try {
			const wantedChannel = guild.channels.resolve(this.config.wantedChannelId);
			if (!wantedChannel?.isTextBased()) return fallback;

			// fetch はメッセージを新しい順で返すため、find で直近の募集が取れる
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
	 * メンバーのルーム間の移動を処理する
	 */
	async handleMemberMove(oldState: VoiceState, newState: VoiceState): Promise<void> {
		const oldRoomId = oldState.channel?.parentId;
		const newRoomId = newState.channel?.parentId;

		if (oldRoomId === newRoomId) return;
		if (!newState.member) return;

		// 入ったルームでは専用チャットを見せる
		if (newRoomId) {
			const newRoom = this.rooms.get(newRoomId);
			if (newRoom) {
				await newRoom.setTextChannelVisibility(newState.member, true);
			}
		}

		// 抜けたルームは、誰もいなければ削除する
		if (oldRoomId) {
			const oldRoom = this.rooms.get(oldRoomId);
			if (oldRoom) {
				await this.removeRoom(oldRoom);
			}
		}
	}

	/**
	 * ルームを削除し、削除できたらメモリとストアから取り除く
	 * @returns 削除できたか（予約中・メンバー在室の場合は false）
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
	 * Bot の起動時に、保存されているルームを復旧する
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
				// 復旧できないルームは保存データから消す
				await this.store.delete(roomData.id);
			}
		}

		console.log(
			`[RoomManager] Room recovery complete: ${recoveredCount} recovered, ${failedCount} failed`,
		);
	}

	/**
	 * Bot の起動時に、Discord の現在の状態と照らしてルームを片付ける
	 * Bot の停止中に起きた退出やイベントの変化は、起動時にだけ検知できる
	 */
	async reconcile(guild: Guild): Promise<void> {
		console.log("[RoomManager] Reconciling rooms...");

		// oxlint-disable-next-line unicorn/no-useless-spread -- removeRoom が反復中に this.rooms を変更するためスナップショットを取る
		for (const room of [...this.rooms.values()]) {
			try {
				// 連携先のイベントが削除・終了・中止されたルームは予約を解除する
				if (room.reserved && room.eventId) {
					const event = await guild.scheduledEvents.fetch(room.eventId).catch(() => null);
					if (!event || event.isCompleted() || event.isCanceled()) {
						room.unreserve();
					}
				}

				// 誰もいないルームは削除する
				await this.removeRoom(room);
			} catch (error) {
				console.error(`[RoomManager] Failed to reconcile room ${room.id}:`, error);
			}
		}

		console.log("[RoomManager] Reconcile complete");
	}
}
