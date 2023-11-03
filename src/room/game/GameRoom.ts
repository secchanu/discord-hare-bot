import type {
	GuildChannelManager,
	GuildMember,
	GuildMemberResolvable,
	Message,
	MessageCollector,
	RoleResolvable,
} from "discord.js";

import Room from "../Room";
import { Game, createGame, defaultGame, gameMap } from "./manager";

//設定の読み込み
import config from "../config";

export default class GameRoom extends Room {
	public game: Game;

	private gameCollector?: MessageCollector;

	constructor(
		manager: GuildChannelManager,
		host?: string | GuildMemberResolvable | null,
	) {
		super(manager, host);
		this.game = defaultGame;
		const owner = this.guild.members.resolve(host ?? "");
		if (owner) {
			this.pickGame(owner);
			this.gameCollector = this.createGameCollector();
		}
	}

	/**
	 * Roomの作成
	 */
	override async create(position?: number, name?: string) {
		return super.create(position, this.game.name ?? name);
	}

	/**
	 * Roomの削除
	 */
	override async delete() {
		const deleted = await super.delete();
		if (deleted) this.gameCollector?.stop();
		return deleted;
	}

	/**
	 * Gameの取得
	 */
	public getGame() {
		return this.game;
	}

	/**
	 * Gameの設定
	 */
	public async setGame(role: RoleResolvable) {
		const gameRole = this.guild.roles.resolve(role);
		const game: Game =
			!gameRole || gameRole.id === this.guild.roles.everyone.id
				? defaultGame
				: gameMap.get(gameRole.id) ?? createGame(gameRole);
		this.game = game;
		await this.setName(game.name);
		return game;
	}

	/**
	 * Room作成者が募集中のゲームを取得
	 */
	private async pickGame(member: GuildMember) {
		const channel = this.guild.channels.resolve(config.wantedChannelId);
		if (!channel?.isTextBased()) return;
		const filter = (message: Message) =>
			Boolean(message.author.id === member.id && message.mentions.roles.size);
		const messages = channel.messages.cache;
		const message = messages.filter(filter).last();
		if (!message) return;
		const messageDate = message.editedAt ?? message.createdAt;
		const nowDate = new Date();
		const diff = nowDate.getTime() - messageDate.getTime();
		if (diff > 6 * 60 * 60 * 1000) return;
		const role = message.mentions.roles.first();
		if (!role) return;
		const key = role.id;
		if (config.ignoreRoleIds.includes(key)) return;
		if (!member.roles.resolve(key)) return;
		await this.setGame(key);
	}

	/**
	 * ゲーム募集の監視
	 */
	private createGameCollector() {
		const channel = this.guild.channels.resolve(config.wantedChannelId);
		if (!channel?.isTextBased()) return;
		const filter = (message: Message) =>
			Boolean(message.mentions.everyone || message.mentions.roles.size);
		const gameCollector = channel.createMessageCollector({ filter });
		gameCollector.on("collect", async (message) => {
			const member = this.members.get(message.author.id);
			if (!member) return;
			const role = message.mentions.roles.first();
			if (!role && !message.mentions.everyone) return;
			const key = role?.id ?? this.guild.roles.everyone.id;
			if (config.ignoreRoleIds.includes(key)) return;
			if (!member.roles.resolve(key)) return;
			await this.setGame(key);
		});
		return gameCollector;
	}
}
