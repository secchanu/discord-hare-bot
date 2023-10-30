import { ChannelType, Collection } from "discord.js";
import type {
	Guild,
	GuildChannelManager,
	GuildMember,
	GuildMemberResolvable,
	Snowflake,
	VoiceBasedChannel,
	VoiceState,
} from "discord.js";

export default class Room {
	protected manager: GuildChannelManager;
	protected host: string;

	protected parentId?: Snowflake;
	protected textChannelHomeId?: Snowflake;
	protected voiceChannelHomeId?: Snowflake;
	protected voiceChannelIds: Snowflake[] = [];

	public reserved = false;

	constructor(
		manager: GuildChannelManager,
		host?: string | GuildMemberResolvable | null,
	) {
		this.manager = manager;
		const owner = this.guild.members.resolve(host ?? "");
		if (owner) {
			this.host = owner.displayName;
		} else if (typeof host === "string") {
			this.host = host;
		} else {
			this.host = "Room";
		}
	}

	/**
	 * 属するサーバー
	 */
	public get guild(): Guild {
		return this.manager.guild;
	}

	/**
	 * 参加しているメンバー(Botを除く)
	 */
	public get members(): Collection<Snowflake, GuildMember> {
		const vcs = [`${this.voiceChannelHomeId}`, ...this.voiceChannelIds]
			.map((id) => this.manager.resolve(id))
			.filter((ch): ch is VoiceBasedChannel => Boolean(ch?.isVoiceBased()));
		const collection = new Collection<Snowflake, GuildMember>();
		if (!vcs.length) return collection;
		const members = collection.concat(...vcs.flatMap((vc) => vc.members));
		const withoutBot = members.filter((member) => !member.user.bot);
		return withoutBot;
	}

	/**
	 * カテゴリーチャンネルの作成
	 */
	protected async createParent(name: string, position?: number) {
		const channel = await this.manager.create({
			name,
			type: ChannelType.GuildCategory,
			position,
		});
		return channel.id;
	}

	/**
	 * テキストチャンネルの作成
	 */
	protected async createTC(name: string) {
		const channel = await this.manager.create({
			name,
			type: ChannelType.GuildText,
			parent: this.parentId,
			permissionOverwrites: [
				{
					id: this.guild.roles.everyone,
					deny: ["ViewChannel"],
				},
			],
		});
		return channel.id;
	}

	/**
	 * ボイスチャンネルの作成
	 */
	protected async createVC(name: string) {
		const channel = await this.manager.create({
			name,
			type: ChannelType.GuildVoice,
			parent: this.parentId,
			bitrate: this.guild.maximumBitrate,
		});
		return channel.id;
	}

	/**
	 * Roomの作成
	 */
	public async create(position?: number, name = "Free") {
		this.parentId =
			this.parentId ?? (await this.createParent(this.host, position));
		this.textChannelHomeId =
			this.textChannelHomeId ?? (await this.createTC("専用チャット"));
		this.voiceChannelHomeId =
			this.voiceChannelHomeId ?? (await this.createVC(name));
		return this.parentId;
	}

	/**
	 * Roomの削除
	 */
	public async delete(): Promise<boolean> {
		if (this.reserved) return false;
		if (this.members.size) return false;
		await this.removeVC(this.voiceChannelIds.length);
		await Promise.all([
			this.manager.delete(`${this.voiceChannelHomeId}`),
			this.manager.delete(`${this.textChannelHomeId}`),
		]);
		await this.manager.delete(`${this.parentId}`);
		return true;
	}

	/**
	 * Nameの取得
	 */
	public getName() {
		const channel = this.manager.resolve(`${this.voiceChannelHomeId}`);
		return channel?.name ?? "Free";
	}

	/**
	 * Nameの設定
	 */
	public async setName(name: string) {
		const channel = this.manager.resolve(`${this.voiceChannelHomeId}`);
		if (!channel) return false;
		if (channel.name === name) return true;
		return Boolean(await channel.setName(name));
	}

	/**
	 * テキストチャンネル閲覧権限の付与・削除
	 */
	protected async viewableTC(
		member: GuildMemberResolvable,
		enable = true,
	): Promise<boolean> {
		const tc = this.manager.resolve(`${this.textChannelHomeId}`);
		if (tc?.type !== ChannelType.GuildText) return false;
		const permissions = tc.permissionOverwrites;
		if (enable) {
			await permissions.create(member, {
				ViewChannel: true,
			});
		} else {
			await permissions.delete(member);
		}
		return true;
	}

	/**
	 * テキストチャンネル閲覧権限の同期
	 */
	public async syncViewableTC() {
		const tc = this.manager.resolve(`${this.textChannelHomeId}`);
		if (tc?.type !== ChannelType.GuildText) return false;
		const members = this.members;
		const attendees = tc.members;
		const both = members.intersect(attendees);
		const add = members.difference(both);
		const remove = attendees.difference(both);
		Promise.all([
			...add.map(async (member) => this.viewableTC(member, true)),
			...remove.map(async (member) => this.viewableTC(member, false)),
		]);
		return true;
	}

	/**
	 * ボイスチャンネルの追加
	 */
	protected async addVC(number = 1) {
		for (let i = 0; i < number; i++) {
			const index = this.voiceChannelIds.length + 1;
			const name = `VC [${index}]`;
			const channelId = await this.createVC(name);
			this.voiceChannelIds.push(channelId);
		}
	}

	/**
	 * ボイスチャンネルの削減
	 */
	protected async removeVC(number = 1) {
		const vcIds = this.voiceChannelIds.splice(-number, number);
		for (const vcId of vcIds.reverse()) {
			await this.manager.delete(vcId);
		}
	}

	/**
	 * 追加ボイスチャンネル数の設定
	 */
	public async setVC(number = 0) {
		const current = this.voiceChannelIds.length;
		const diff = number - current;
		if (diff > 0) {
			await this.addVC(diff);
		} else if (diff < 0) {
			await this.removeVC(-diff);
		}
		return this.voiceChannelIds.length;
	}

	/**
	 * 追加ボイスチャンネル数の取得
	 */
	public getVC() {
		return this.voiceChannelIds.length;
	}

	/**
	 * メンバーの参加処理
	 */
	public async join(member: GuildMemberResolvable) {
		await this.viewableTC(member, true);
	}

	/**
	 * メンバーの退出処理
	 * 現在は特になし
	 */
	public async leave(member: GuildMemberResolvable) {
		await this.viewableTC(member, false);
	}

	/**
	 * メンバーの移動
	 */
	public async move(voiceState: VoiceState, index = 0) {
		const vcId = [this.voiceChannelHomeId, ...this.voiceChannelIds].at(index);
		if (!vcId) return false;
		if (voiceState.channelId === vcId) return true;
		const moved = await voiceState.setChannel(vcId).catch(() => null);
		return Boolean(moved);
	}

	/**
	 * メンバー全員の移動
	 */
	public async call(index = 0) {
		await Promise.all(
			this.members.map(async (member) => {
				const voiceState = member.voice;
				return this.move(voiceState, index);
			}),
		);
	}
}
