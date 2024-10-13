import {
	ChannelType,
	Collection,
	type Guild,
	type GuildChannelManager,
	type GuildMember,
	type GuildMemberResolvable,
	type Message,
	type MessageCollector,
	PermissionFlagsBits,
	type Snowflake,
	type VoiceBasedChannel,
	type VoiceState,
} from "discord.js";
import { config } from "../../bot/config";
import { TIMEOUT } from "../../constants";
import { GameManager } from "../games/GameManager";
import type { Game } from "../games/types";
import type { CreateRoomOptions, RoomData } from "./types";

/**
 * Discord ギルドルーム
 */
export class Room {
	private guild: Guild;
	private channelManager: GuildChannelManager;
	private hostname: string;
	private ownerId?: Snowflake;
	private game: Game;
	private gameCollector?: MessageCollector;

	public reserved = false;
	public eventId?: Snowflake;

	// チャンネルID
	private categoryId?: Snowflake;
	private textChannelId?: Snowflake;
	private voiceChannelId?: Snowflake;
	private additionalVoiceChannelIds: Snowflake[] = [];

	constructor(guild: Guild, options: CreateRoomOptions) {
		this.guild = guild;
		this.channelManager = guild.channels;
		this.hostname = options.hostname;
		this.ownerId = options.ownerId;
		this.reserved = options.reserved ?? false;
		this.eventId = options.eventId;

		// デフォルトゲーム設定
		this.game = GameManager.getInstance().getDefaultGame();
	}

	/**
	 * データベース保存用のデータを取得
	 */
	toData(): RoomData {
		if (!this.categoryId || !this.textChannelId || !this.voiceChannelId) {
			throw new Error("Room channels are not fully initialized");
		}

		return {
			id: this.categoryId,
			guildId: this.guild.id,
			hostname: this.hostname,
			ownerId: this.ownerId,
			gameId: this.game.id,
			reserved: this.reserved,
			createdAt: new Date(),
			channels: {
				categoryId: this.categoryId,
				textChannelId: this.textChannelId,
				voiceChannelId: this.voiceChannelId,
				additionalVoiceChannelIds: this.additionalVoiceChannelIds,
			},
			eventId: this.eventId,
		};
	}

	/**
	 * 保存データから復元
	 */
	static async fromData(guild: Guild, data: RoomData): Promise<Room> {
		const room = new Room(guild, {
			hostname: data.hostname,
			ownerId: data.ownerId,
			reserved: data.reserved,
			eventId: data.eventId,
		});

		// チャンネルIDを復元
		room.categoryId = data.channels.categoryId;
		room.textChannelId = data.channels.textChannelId;
		room.voiceChannelId = data.channels.voiceChannelId;
		room.additionalVoiceChannelIds = data.channels.additionalVoiceChannelIds;

		// ゲームを復元
		const game = await GameManager.getInstance().getGame(data.gameId);
		if (game) room.game = game;

		// ゲーム監視を再開
		room.setupGameCollector();

		return room;
	}

	/**
	 * カテゴリIDを取得（ルームのID）
	 */
	get id(): Snowflake | undefined {
		return this.categoryId;
	}

	/**
	 * ボイスチャンネルを取得
	 */
	get voiceChannel(): VoiceBasedChannel | undefined {
		if (!this.voiceChannelId) return undefined;
		const channel = this.channelManager.resolve(this.voiceChannelId);
		return channel?.isVoiceBased() ? channel : undefined;
	}

	/**
	 * 現在参加しているメンバー（Botを除く）
	 */
	get members(): Collection<Snowflake, GuildMember> {
		const voiceChannels = [
			this.voiceChannelId,
			...this.additionalVoiceChannelIds,
		]
			.filter((id): id is Snowflake => Boolean(id))
			.map((id) => this.channelManager.resolve(id))
			.filter((ch): ch is VoiceBasedChannel => Boolean(ch?.isVoiceBased()));

		const collection = new Collection<Snowflake, GuildMember>();
		if (!voiceChannels.length) return collection;

		const members = collection.concat(
			...voiceChannels.flatMap((vc) => vc.members),
		);
		return members.filter((member) => !member.user.bot);
	}

	/**
	 * ルームを作成
	 */
	async create(position?: number): Promise<Snowflake> {
		// カテゴリーチャンネルを作成
		const category = await this.channelManager.create({
			name: this.hostname,
			type: ChannelType.GuildCategory,
			position,
		});
		this.categoryId = category.id;

		// テキストチャンネルを作成（プライベートチャンネル）
		const textChannel = await this.channelManager.create({
			name: "専用チャット",
			type: ChannelType.GuildText,
			parent: category,
			permissionOverwrites: [
				{
					id: this.guild.id, // @everyone
					deny: ["ViewChannel"],
				},
			],
		});
		this.textChannelId = textChannel.id;

		// 初期ゲームを決定
		if (this.ownerId) {
			const owner = this.guild.members.resolve(this.ownerId);
			if (owner) {
				await this.determineInitialGame(owner);
			}
		}

		// ボイスチャンネルを作成
		const voiceChannel = await this.channelManager.create({
			name: this.game.name,
			type: ChannelType.GuildVoice,
			parent: category,
			bitrate: this.guild.maximumBitrate,
		});
		this.voiceChannelId = voiceChannel.id;

		// ゲームコレクターをセットアップ
		this.setupGameCollector();

		return this.categoryId;
	}

	/**
	 * ルームを削除
	 */
	async delete(): Promise<boolean> {
		if (this.reserved) return false;
		if (this.members.size) return false;

		// 追加VCを削除
		await this.setAdditionalVoiceChannels(0);

		// チャンネルを削除
		const deletions = [
			this.voiceChannelId && this.channelManager.delete(this.voiceChannelId),
			this.textChannelId && this.channelManager.delete(this.textChannelId),
		].filter(Boolean);

		await Promise.all(deletions);

		// カテゴリを削除
		if (this.categoryId) {
			await this.channelManager.delete(this.categoryId);
		}

		// コレクターを停止
		this.gameCollector?.stop();

		return true;
	}

	/**
	 * メンバーがルームに参加
	 */
	async join(member: GuildMemberResolvable): Promise<void> {
		await this.setTextChannelPermission(member, true);
	}

	/**
	 * メンバーがルームから退出
	 */
	async leave(member: GuildMemberResolvable): Promise<void> {
		// イベントルームの場合はテキストチャンネルの権限を削除
		if (this.eventId) {
			await this.setTextChannelPermission(member, false);
		}
	}

	/**
	 * ゲームを設定（存在しない場合は作成）
	 */
	async setGame(gameId: Snowflake): Promise<Game | null> {
		const gameManager = GameManager.getInstance();

		// @everyoneの場合はdefaultGameを使用
		if (gameId === this.guild.roles.everyone.id) {
			gameId = gameManager.getDefaultGame().id;
		}

		// 同じゲームの場合は処理をスキップ
		if (this.game.id === gameId) return this.game;

		let game = await gameManager.getGame(gameId);

		// ゲームが存在しない場合は新しく作成
		if (!game) {
			const role = this.guild.roles.resolve(gameId);
			if (!role || config.ignoreRoleIds.includes(gameId)) {
				return null;
			}

			game = await gameManager.createGame(role);
		}

		this.game = game;
		await this.updateVoiceChannelName(game.name);

		return game;
	}

	/**
	 * 追加VCの数を設定
	 */
	async setAdditionalVoiceChannels(count: number): Promise<number> {
		const current = this.additionalVoiceChannelIds.length;
		const diff = count - current;

		if (diff > 0) {
			// VCを追加
			for (let i = 0; i < diff; i++) {
				const index = this.additionalVoiceChannelIds.length + 1;
				if (!this.categoryId) {
					throw new Error("Category ID not set");
				}
				const channel = await this.channelManager.create({
					name: `VC [${index}]`,
					type: ChannelType.GuildVoice,
					parent: this.categoryId,
					bitrate: this.guild.maximumBitrate,
				});
				this.additionalVoiceChannelIds.push(channel.id);
			}
		} else if (diff < 0) {
			// VCを削除
			const toDelete = this.additionalVoiceChannelIds.splice(diff);
			await Promise.all(toDelete.map((id) => this.channelManager.delete(id)));
		}

		return this.additionalVoiceChannelIds.length;
	}

	/**
	 * メンバーを特定のVCに移動
	 */
	async moveMembers(voiceState: VoiceState, index = 0): Promise<boolean> {
		const vcIds = [this.voiceChannelId, ...this.additionalVoiceChannelIds];
		const targetVcId = vcIds[index];

		if (!targetVcId) return false;
		if (voiceState.channelId === targetVcId) return true;

		try {
			await voiceState.setChannel(targetVcId);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * 全メンバーを集合
	 */
	async callMembers(index = 0): Promise<void> {
		await Promise.all(
			this.members.map((member) => this.moveMembers(member.voice, index)),
		);
	}

	/**
	 * テキストチャンネルの権限を同期
	 */
	async syncTextChannelPermissions(): Promise<void> {
		if (!this.textChannelId) return;
		const textChannel = this.channelManager.resolve(this.textChannelId);
		if (!textChannel || textChannel.type !== ChannelType.GuildText) return;

		const currentMembers = this.members;

		const newOverwrites = [
			{
				id: this.guild.id,
				deny: [PermissionFlagsBits.ViewChannel],
			},
			...Array.from(currentMembers.values()).map((member) => ({
				id: member.id,
				allow: [PermissionFlagsBits.ViewChannel],
			})),
		];

		await textChannel.permissionOverwrites.set(newOverwrites);
	}

	/**
	 * テキストチャンネルの閲覧権限を設定
	 */
	private async setTextChannelPermission(
		member: GuildMemberResolvable,
		allow: boolean,
	): Promise<void> {
		if (!this.textChannelId) return;
		const textChannel = this.channelManager.resolve(this.textChannelId);
		if (!textChannel || textChannel.type !== ChannelType.GuildText) return;

		await textChannel.permissionOverwrites.edit(member, {
			ViewChannel: allow ? true : null,
		});
	}

	/**
	 * ボイスチャンネル名を更新
	 */
	private async updateVoiceChannelName(name: string): Promise<void> {
		if (!this.voiceChannelId) return;
		const voiceChannel = this.channelManager.resolve(this.voiceChannelId);
		if (!voiceChannel || voiceChannel.name === name) return;

		await voiceChannel.setName(name);
	}

	/**
	 * 過去メッセージから初期ゲームを決定
	 */
	private async determineInitialGame(member: GuildMember): Promise<void> {
		const wantedChannel = this.guild.channels.resolve(config.wantedChannelId);
		if (!wantedChannel?.isTextBased()) return;

		// 過去メッセージから最新の募集を検索
		const messages = wantedChannel.messages.cache.filter(
			(msg: Message) =>
				msg.author.id === member.id && msg.mentions.roles.size > 0,
		);

		const lastMessage = messages.last();
		if (!lastMessage) return;

		// タイムアウトチェック
		const messageAge =
			Date.now() - (lastMessage.editedAt ?? lastMessage.createdAt).getTime();
		if (messageAge > TIMEOUT.GAME_WANTED_MESSAGE) return;

		// 有効なロールを取得してゲーム設定
		const role = lastMessage.mentions.roles.first();
		const roleId = role?.id ?? this.guild.roles.everyone.id;
		if (member.roles.resolve(roleId)) {
			await this.setGame(roleId);
		}
	}

	/**
	 * ゲーム募集の監視をセットアップ
	 */
	private setupGameCollector(): void {
		const wantedChannel = this.guild.channels.resolve(config.wantedChannelId);
		if (!wantedChannel?.isTextBased()) return;

		// 6時間のタイムアウト
		const OBSERVE_TIME = TIMEOUT.GAME_WANTED_MESSAGE;

		// メッセージフィルター
		const filter = (message: Message) => {
			// 時間チェック
			const nowDate = new Date();
			const messageDate = message.editedAt ?? message.createdAt;
			const diff = nowDate.getTime() - messageDate.getTime();
			if (diff > OBSERVE_TIME) return false;

			// メンション条件
			return message.mentions.everyone || message.mentions.roles.size > 0;
		};

		this.gameCollector = wantedChannel.createMessageCollector({ filter });

		// 新しい募集メッセージの監視
		this.gameCollector.on("collect", async (message) => {
			const author = this.guild.members.resolve(message.author.id);
			if (!author || !this.members.has(message.author.id)) return;

			const role = message.mentions.roles.first();
			const roleId = role?.id ?? this.guild.roles.everyone.id;
			if (author.roles.resolve(roleId)) {
				await this.setGame(roleId);
			}
		});
	}
}
