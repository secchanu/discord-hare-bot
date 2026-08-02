import {
	ChannelType,
	Collection,
	DiscordAPIError,
	type Guild,
	type GuildChannelManager,
	type GuildMember,
	type GuildMemberResolvable,
	PermissionFlagsBits,
	RESTJSONErrorCodes,
	type Snowflake,
	type VoiceBasedChannel,
	type VoiceState,
} from "discord.js";
import { defaultGame, type Game } from "../games/types";
import type { CreateRoomOptions, RoomData, RoomHooks } from "./types";

/**
 * Discord ギルドルーム
 *
 * 状態を変更する mutation メソッドは hooks.persist を必ず呼ぶため、
 * 呼び出し側が永続化を意識する必要はない。
 * Discord への反映（チャンネル名など）はベストエフォートで、
 * 状態の確定・永続化が常に先行する。
 */
export class Room {
	private readonly _guild: Guild;
	private channelManager: GuildChannelManager;
	private hooks: RoomHooks;
	private hostname: string;
	private ownerId?: Snowflake;
	private _game: Game;
	private createdAt: Date;
	private _reserved: boolean;

	public readonly eventId?: Snowflake;

	// チャンネルID
	private categoryId?: Snowflake;
	private textChannelId?: Snowflake;
	private _voiceChannelId?: Snowflake;
	private additionalVoiceChannelIds: Snowflake[] = [];

	// チャンネル名変更のコアレス用状態
	private desiredVoiceChannelName?: string;
	private renameInFlight = false;

	// 削除の冪等化用（実行中の削除処理を共有する）
	private deletion?: Promise<boolean>;

	constructor(guild: Guild, options: CreateRoomOptions, hooks: RoomHooks) {
		this._guild = guild;
		this.channelManager = guild.channels;
		this.hooks = hooks;
		this.hostname = options.hostname;
		this.ownerId = options.ownerId;
		this._reserved = options.reserved ?? false;
		this.eventId = options.eventId;
		this._game = options.game ?? defaultGame;
		this.createdAt = new Date();
	}

	/**
	 * データベース保存用のデータを取得
	 */
	toData(): RoomData {
		if (!this.categoryId || !this.textChannelId || !this._voiceChannelId) {
			throw new Error("Room channels are not fully initialized");
		}

		return {
			id: this.categoryId,
			guildId: this._guild.id,
			hostname: this.hostname,
			ownerId: this.ownerId,
			gameId: this._game.id,
			reserved: this._reserved,
			createdAt: this.createdAt.toISOString(),
			channels: {
				categoryId: this.categoryId,
				textChannelId: this.textChannelId,
				voiceChannelId: this._voiceChannelId,
				additionalVoiceChannelIds: [...this.additionalVoiceChannelIds],
			},
			eventId: this.eventId,
		};
	}

	/**
	 * 保存データから復元
	 * ゲームの解決は呼び出し側（RoomManager）が行う
	 */
	static fromData(guild: Guild, data: RoomData, game: Game, hooks: RoomHooks): Room {
		const room = new Room(
			guild,
			{
				hostname: data.hostname,
				ownerId: data.ownerId,
				reserved: data.reserved,
				eventId: data.eventId,
				game,
			},
			hooks,
		);

		// チャンネルIDを復元
		room.categoryId = data.channels.categoryId;
		room.textChannelId = data.channels.textChannelId;
		room._voiceChannelId = data.channels.voiceChannelId;
		room.additionalVoiceChannelIds = [...data.channels.additionalVoiceChannelIds];
		room.createdAt = new Date(data.createdAt);

		return room;
	}

	/**
	 * カテゴリIDを取得（ルームのID）
	 */
	get id(): Snowflake | undefined {
		return this.categoryId;
	}

	get guild(): Guild {
		return this._guild;
	}

	get game(): Game {
		return this._game;
	}

	get reserved(): boolean {
		return this._reserved;
	}

	get voiceChannelId(): Snowflake | undefined {
		return this._voiceChannelId;
	}

	get additionalVoiceChannelCount(): number {
		return this.additionalVoiceChannelIds.length;
	}

	/**
	 * ボイスチャンネルを取得
	 */
	get voiceChannel(): VoiceBasedChannel | undefined {
		if (!this._voiceChannelId) return undefined;
		const channel = this.channelManager.resolve(this._voiceChannelId);
		return channel?.isVoiceBased() ? channel : undefined;
	}

	/**
	 * 指定チャンネルがこのルームのVC（メイン・追加）か判定
	 */
	hasVoiceChannel(channelId: Snowflake): boolean {
		return this._voiceChannelId === channelId || this.additionalVoiceChannelIds.includes(channelId);
	}

	/**
	 * 現在参加しているメンバー（Botを除く）
	 */
	get members(): Collection<Snowflake, GuildMember> {
		const voiceChannels = [this._voiceChannelId, ...this.additionalVoiceChannelIds]
			.filter((id): id is Snowflake => Boolean(id))
			.map((id) => this.channelManager.resolve(id))
			.filter((ch): ch is VoiceBasedChannel => Boolean(ch?.isVoiceBased()));

		const collection = new Collection<Snowflake, GuildMember>();
		if (!voiceChannels.length) return collection;

		const members = collection.concat(...voiceChannels.flatMap((vc) => vc.members));
		return members.filter((member) => !member.user.bot);
	}

	/**
	 * 予約（イベント連携）を解除する
	 * 削除の直前に呼ばれる想定のため永続化はせず、
	 * 削除されないまま再起動した場合は起動時の reconcile が再解除する
	 */
	unreserve(): void {
		this._reserved = false;
	}

	/**
	 * ルームを作成
	 * 途中で失敗した場合は作成済みチャンネルをベストエフォートで削除して再スローする
	 * （Discord API に原子性はないため、取りこぼしは起動時の reconcile に委ねる）
	 */
	async create(position?: number): Promise<Snowflake> {
		const createdChannelIds: Snowflake[] = [];

		try {
			// カテゴリーチャンネルを作成
			const category = await this.channelManager.create({
				name: this.hostname,
				type: ChannelType.GuildCategory,
				position,
			});
			this.categoryId = category.id;
			createdChannelIds.push(category.id);

			// テキストチャンネルとボイスチャンネルを作成
			const [textResult, voiceResult] = await Promise.allSettled([
				this.channelManager.create({
					name: "専用チャット",
					type: ChannelType.GuildText,
					parent: category,
					permissionOverwrites: [
						{
							id: this._guild.id, // @everyone
							deny: ["ViewChannel"],
						},
					],
				}),
				this.channelManager.create({
					name: this._game.name,
					type: ChannelType.GuildVoice,
					parent: category,
					bitrate: this._guild.maximumBitrate,
				}),
			]);

			if (textResult.status === "fulfilled") {
				this.textChannelId = textResult.value.id;
				createdChannelIds.push(textResult.value.id);
			}
			if (voiceResult.status === "fulfilled") {
				this._voiceChannelId = voiceResult.value.id;
				createdChannelIds.push(voiceResult.value.id);
			}
			if (textResult.status === "rejected") throw textResult.reason;
			if (voiceResult.status === "rejected") throw voiceResult.reason;

			await this.hooks.persist(this);

			return this.categoryId;
		} catch (error) {
			await Promise.allSettled(createdChannelIds.map((id) => this.channelManager.delete(id)));
			this.categoryId = undefined;
			this.textChannelId = undefined;
			this._voiceChannelId = undefined;
			throw error;
		}
	}

	/**
	 * ルームを削除
	 * 並行して呼ばれた場合は実行中の削除処理を共有する（二重削除の防止）
	 * チャンネル削除に失敗した場合は再スローし、残骸の回収は reconcile に委ねる
	 */
	async delete(): Promise<boolean> {
		if (this.deletion) return this.deletion;

		const deletion = this.performDelete();
		this.deletion = deletion;

		try {
			const deleted = await deletion;
			if (!deleted) this.deletion = undefined;
			return deleted;
		} catch (error) {
			this.deletion = undefined;
			throw error;
		}
	}

	private async performDelete(): Promise<boolean> {
		if (this._reserved) return false;
		if (this.members.size) return false;

		// カテゴリを最後にし、子チャンネルから順に削除する
		const channelIds = [
			...this.additionalVoiceChannelIds,
			this._voiceChannelId,
			this.textChannelId,
			this.categoryId,
		].filter((id): id is Snowflake => Boolean(id));

		for (const id of channelIds) {
			await this.deleteChannelIfExists(id);
		}

		return true;
	}

	/**
	 * チャンネルを削除する（既に存在しない場合は成功として扱う）
	 */
	private async deleteChannelIfExists(channelId: Snowflake): Promise<void> {
		try {
			await this.channelManager.delete(channelId);
		} catch (error) {
			if (isUnknownChannelError(error)) return;
			throw error;
		}
	}

	/**
	 * テキストチャンネルの閲覧可否を設定
	 * @param member 対象メンバー
	 * @param visible true: 閲覧可能にする、false: 閲覧不可にする
	 */
	async setTextChannelVisibility(member: GuildMemberResolvable, visible: boolean): Promise<void> {
		if (!this.textChannelId) return;
		const textChannel = this.channelManager.resolve(this.textChannelId);
		if (!textChannel || textChannel.type !== ChannelType.GuildText) return;

		await textChannel.permissionOverwrites.edit(member, {
			ViewChannel: visible ? true : null,
		});
	}

	/**
	 * ゲームを設定
	 * ロールの妥当性検証やゲームの解決は RoomManager.changeGame() が行う
	 */
	async setGame(game: Game): Promise<void> {
		if (this._game.id === game.id) return;

		this._game = game;
		await this.hooks.persist(this);

		// Discordへの反映はベストエフォート（状態と永続化が正）
		this.requestVoiceChannelRename(game.name);
	}

	/**
	 * 追加VCの数を設定
	 */
	async setAdditionalVoiceChannels(count: number): Promise<number> {
		const current = this.additionalVoiceChannelIds.length;
		const diff = count - current;

		try {
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
						bitrate: this._guild.maximumBitrate,
					});
					this.additionalVoiceChannelIds.push(channel.id);
				}
			} else if (diff < 0) {
				// VCを削除
				const toDelete = this.additionalVoiceChannelIds.splice(diff);
				await Promise.all(toDelete.map((id) => this.deleteChannelIfExists(id)));
			}
		} catch (error) {
			// 途中失敗でも実際に作成・削除できた分は状態に反映済みのため保存してから再スローする
			await this.hooks.persist(this).catch((persistError) => {
				console.error("[Room] Failed to persist after partial VC change:", persistError);
			});
			throw error;
		}

		if (diff !== 0) {
			await this.hooks.persist(this);
		}

		return this.additionalVoiceChannelIds.length;
	}

	/**
	 * メンバーを特定のVCに移動
	 */
	async moveMembers(voiceState: VoiceState, index = 0): Promise<boolean> {
		const vcIds = [this._voiceChannelId, ...this.additionalVoiceChannelIds];
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
		await Promise.all(this.members.map((member) => this.moveMembers(member.voice, index)));
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
				id: this._guild.id,
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
	 * ボイスチャンネル名の変更を要求する
	 * チャンネル名変更には 2回/10分 のレート制限があるため、
	 * 要求が連続した場合は最新の名前だけを反映する（途中の名前は破棄）
	 */
	private requestVoiceChannelRename(name: string): void {
		this.desiredVoiceChannelName = name;
		if (this.renameInFlight) return;

		this.renameInFlight = true;
		void (async () => {
			try {
				while (true) {
					const target = this.desiredVoiceChannelName;
					if (!target || !this._voiceChannelId) return;

					const voiceChannel = this.channelManager.resolve(this._voiceChannelId);
					if (!voiceChannel || voiceChannel.name === target) return;

					await voiceChannel.setName(target);

					// 待機中に新しい名前が要求されていなければ完了
					if (this.desiredVoiceChannelName === target) return;
				}
			} catch (error) {
				console.error("[Room] Failed to rename voice channel:", error);
			} finally {
				this.renameInFlight = false;
			}
		})();
	}
}

/**
 * Discord API の Unknown Channel エラー判定
 */
function isUnknownChannelError(error: unknown): boolean {
	return error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownChannel;
}
