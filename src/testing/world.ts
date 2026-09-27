import { DatabaseSync } from "node:sqlite";
import {
	ApplicationCommandOptionType,
	ChannelType,
	type Client,
	ComponentType,
	Events,
	GuildScheduledEventStatus,
	InteractionType,
} from "discord.js";
import { vi } from "vitest";
import type { BotConfig } from "../bot/config";
import type { AppContext } from "../bot/context";
import { createBot } from "../bot/createBot";
import { GameStore } from "../features/games/GameStore";
import { RoomStore } from "../features/rooms/RoomStore";
import type { RoomData } from "../features/rooms/types";
import {
	type ChannelState,
	canView,
	FakeDiscordServer,
	type InteractionRecord,
	type MemberState,
	type MessageState,
	type RoleState,
	type ScheduledEventState,
} from "./discord/server";

// テスト開始時点の日時
const START_TIME = new Date("2026-09-27T12:00:00+09:00");

/**
 * Bot と偽の Discord サーバーからなるテスト環境を作る
 * タイマーと日時は偽物に切り替わり、world.advance() でだけ進む
 */
export async function createWorld(): Promise<World> {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: START_TIME });
	const world = new World();
	await world.startBot();
	return world;
}

/**
 * Bot と偽の Discord サーバーからなるテスト環境
 */
export class World {
	readonly server = new FakeDiscordServer();
	readonly ignoredRole: RoleState;
	readonly readyChannel: ChannelState;
	readonly wantedChannel: ChannelState;
	readonly generalChannel: ChannelState;

	private databases = { games: new DatabaseSync(":memory:"), rooms: new DatabaseSync(":memory:") };
	private bot: { client: Client; ctx: AppContext } | null = null;

	constructor() {
		this.ignoredRole = this.server.addRole("管理者");
		const readyCategory = this.server.addChannel({
			type: ChannelType.GuildCategory,
			name: "READY",
		});
		this.readyChannel = this.server.addChannel({
			type: ChannelType.GuildVoice,
			name: "部屋生成",
			parentId: readyCategory.id,
		});
		this.wantedChannel = this.server.addChannel({ type: ChannelType.GuildText, name: "募集" });
		this.generalChannel = this.server.addChannel({ type: ChannelType.GuildText, name: "総合" });
	}

	/** @everyone ロール */
	get everyoneRole(): RoleState {
		const role = this.server.roles.get(this.server.guildId);
		if (!role) throw new Error("@everyone ロールがありません");
		return role;
	}

	get config(): BotConfig {
		return {
			botToken: "token",
			guildId: this.server.guildId,
			readyChannelId: this.readyChannel.id,
			wantedChannelId: this.wantedChannel.id,
			ignoreRoleIds: [this.ignoredRole.id],
		};
	}

	/**
	 * Bot を起動し、起動処理（コマンドの登録、ルームの復旧と片付け）が終わるまで待つ
	 */
	async startBot(): Promise<void> {
		const bot = createBot(this.config, this.databases);
		this.bot = bot;
		this.server.connect(bot.client);
		bot.client.emit(Events.ClientReady, bot.client as Client<true>);
		await this.settle();
	}

	/**
	 * Bot を停止する（停止中の変化は、次の起動時の状態として Bot に届く）
	 */
	stopBot(): void {
		this.bot?.client.destroy();
		this.bot = null;
		this.server.disconnect();
	}

	async restartBot(): Promise<void> {
		this.stopBot();
		await this.startBot();
	}

	dispose(): void {
		this.stopBot();
		vi.useRealTimers();
	}

	/**
	 * Bot が使うルームの保存先
	 */
	roomStore(): RoomStore {
		return new RoomStore(this.databases.rooms);
	}

	/**
	 * ロールのゲームにデータを保存する
	 */
	async saveGameData(role: RoleState, data: Record<string, string[]>): Promise<void> {
		await new GameStore(this.databases.games).set(role.id, { id: role.id, name: role.name, data });
	}

	/**
	 * 保存されているロールのゲームのデータ
	 */
	async savedGameData(role: RoleState): Promise<Record<string, string[]> | undefined> {
		return (await new GameStore(this.databases.games).get(role.id))?.data;
	}

	/**
	 * 保存されているルームのデータ
	 */
	savedRooms(): Promise<RoomData[]> {
		return this.roomStore().getAll();
	}

	/**
	 * 時間を進める
	 */
	async advance(ms: number): Promise<void> {
		await vi.advanceTimersByTimeAsync(ms);
		await this.settle();
	}

	/**
	 * Bot の処理と、それに伴う Discord からのイベントが落ち着くまで待つ
	 */
	async settle(): Promise<void> {
		let requestCount = -1;
		for (let round = 0; round < 100 && requestCount !== this.server.requests.length; round++) {
			requestCount = this.server.requests.length;
			for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
		}
	}

	addRole(name: string): RoleState {
		return this.server.addRole(name);
	}

	addMember(name: string, options: { roles?: RoleState[]; bot?: boolean } = {}): Member {
		const state = this.server.addMember(
			name,
			(options.roles ?? []).map((role) => role.id),
			options.bot ?? false,
		);
		return new Member(this, state);
	}

	addTextChannel(name: string): ChannelState {
		return this.server.addChannel({ type: ChannelType.GuildText, name });
	}

	addVoiceChannel(name: string): ChannelState {
		return this.server.addChannel({ type: ChannelType.GuildVoice, name });
	}

	/**
	 * 最初のメンバーがルームを作り、残りのメンバーがそのボイスチャンネルに入った状態を作る
	 */
	async setupRoom(...names: string[]): Promise<{ room: RoomView; members: Member[] }> {
		const members = names.map((name) => this.addMember(name));
		const [owner, ...others] = members;
		const room = await owner.createRoom();
		for (const member of others) await member.joinVoice(room.voiceChannel);
		return { room, members };
	}

	async createScheduledEvent(name: string, channel: ChannelState): Promise<ScheduledEvent> {
		const event = this.server.createScheduledEvent(name, channel.id);
		await this.settle();
		return new ScheduledEvent(this, event);
	}

	channel(channelId: string): ChannelState | undefined {
		return this.server.channels.get(channelId);
	}

	/**
	 * カテゴリー名からルームを探す
	 */
	findRoom(name: string): RoomView | undefined {
		const category = [...this.server.channels.values()].find(
			(channel) => channel.type === ChannelType.GuildCategory && channel.name === name,
		);
		return category ? new RoomView(this, category.id) : undefined;
	}

	message(messageId: string): MessageView | undefined {
		const message = this.server.messages.get(messageId);
		return message ? new MessageView(message) : undefined;
	}
}

/**
 * サーバーのメンバー
 */
export class Member {
	constructor(
		private world: World,
		readonly state: MemberState,
	) {}

	get id(): string {
		return this.state.id;
	}

	get name(): string {
		return this.state.name;
	}

	/** 接続しているボイスチャンネル */
	get voiceChannelId(): string | undefined {
		return this.world.server.voice.get(this.id);
	}

	/** メンバーへのメンション */
	get mention(): string {
		return `<@${this.id}>`;
	}

	canView(channel: ChannelState): boolean {
		const current = this.world.channel(channel.id) ?? channel;
		return canView(current, this.world.server.guildId, this.id);
	}

	async joinVoice(channel: ChannelState): Promise<void> {
		this.world.server.setVoiceChannel(this.id, channel.id);
		await this.world.settle();
	}

	async leaveVoice(): Promise<void> {
		this.world.server.setVoiceChannel(this.id, null);
		await this.world.settle();
	}

	/**
	 * 準備チャンネルに入ってルームを作り、そのルームを返す
	 */
	async createRoom(): Promise<RoomView> {
		await this.joinVoice(this.world.readyChannel);
		const room = this.world.findRoom(this.name);
		if (!room) throw new Error(`${this.name} のルームが作られていません`);
		return room;
	}

	async post(
		channel: ChannelState,
		options: { mentions?: RoleState[]; mentionEveryone?: boolean } = {},
	): Promise<void> {
		this.world.server.postMessage(this.id, channel.id, {
			mentionRoleIds: (options.mentions ?? []).map((role) => role.id),
			mentionEveryone: options.mentionEveryone ?? false,
		});
		await this.world.settle();
	}

	/**
	 * スラッシュコマンドを実行する
	 * @param command "team" や "rand data" のようにサブコマンドまで空白区切りで指定する
	 */
	async run(
		command: string,
		channel: ChannelState,
		options: Record<string, string | number | RoleState> = {},
	): Promise<CommandRun> {
		const [name, subcommand] = command.split(" ");
		const definition = this.world.server.command(name) as CommandDefinition | undefined;
		const optionDefinitions = subcommand
			? definition?.options?.find((option) => option.name === subcommand)?.options
			: definition?.options;

		const resolvedRoles: Record<string, unknown> = {};
		const rawOptions = Object.entries(options).map(([optionName, value]) => {
			const optionDefinition = optionDefinitions?.find((option) => option.name === optionName);
			const type = optionDefinition?.type ?? ApplicationCommandOptionType.String;
			if (
				typeof value === "number" &&
				((optionDefinition?.min_value !== undefined && value < optionDefinition.min_value) ||
					(optionDefinition?.max_value !== undefined && value > optionDefinition.max_value))
			) {
				// Discord のクライアントが送信できるのは、コマンドの定義の範囲内の値だけ
				throw new RangeError(`${command} の ${optionName} に ${value} は指定できません`);
			}
			if (typeof value === "object") {
				resolvedRoles[value.id] = this.world.server.rawRole(value);
				return { name: optionName, type, value: value.id };
			}
			return { name: optionName, type, value };
		});

		const record = this.world.server.sendInteraction(this.id, channel.id, {
			type: InteractionType.ApplicationCommand,
			data: {
				id: (definition?.id as string | undefined) ?? "0",
				name,
				type: 1,
				guild_id: this.world.server.guildId,
				options: subcommand
					? [
							{
								name: subcommand,
								type: ApplicationCommandOptionType.Subcommand,
								options: rawOptions,
							},
						]
					: rawOptions,
				resolved: { roles: resolvedRoles },
			},
		});
		await this.world.settle();
		return new CommandRun(this.world, record);
	}

	async click(message: MessageView, customId: string): Promise<InteractionRecord> {
		// Discord のクライアントで押せるのは、表示されているボタンだけ
		if (!this.world.message(message.id)?.buttons.includes(customId)) {
			throw new Error(`${customId} ボタンは表示されていません`);
		}
		return this.sendComponent(message, {
			custom_id: customId,
			component_type: ComponentType.Button,
		});
	}

	async select(
		message: MessageView,
		customId: string,
		values: string[],
	): Promise<InteractionRecord> {
		// Discord のクライアントで選べるのは、表示されている選択肢だけ
		const selectable = this.world.message(message.id)?.selectMenu(customId);
		if (
			!selectable ||
			!values.every((value) => selectable.some((option) => option.value === value))
		) {
			throw new Error(`${customId} メニューで ${values.join(", ")} は選べません`);
		}
		return this.sendComponent(message, {
			custom_id: customId,
			component_type: ComponentType.StringSelect,
			values,
		});
	}

	/**
	 * 開いているモーダルに入力して送信する（入力しない項目は初期値のまま）
	 */
	async submitModal(values: Record<string, string>): Promise<InteractionRecord> {
		const modal = this.world.server.openModals.get(this.id);
		if (!modal) throw new Error(`${this.name} はモーダルを開いていません`);
		this.world.server.openModals.delete(this.id);

		const record = this.world.server.sendInteraction(
			this.id,
			modal.channelId,
			{
				type: InteractionType.ModalSubmit,
				data: {
					custom_id: modal.customId,
					components: modal.fields.map((field) => ({
						type: ComponentType.ActionRow,
						components: [
							{
								type: ComponentType.TextInput,
								custom_id: field.customId,
								value: values[field.customId] ?? field.value,
							},
						],
					})),
				},
			},
			modal.messageId,
		);
		await this.world.settle();
		return record;
	}

	/**
	 * 開いているモーダルを、Bot に知らせずに閉じる（Discord と同じ）
	 */
	closeModal(): void {
		this.world.server.openModals.delete(this.id);
	}

	/** 開いているモーダルの入力欄の初期値 */
	get modalFields(): Record<string, string> | undefined {
		const modal = this.world.server.openModals.get(this.id);
		return modal && Object.fromEntries(modal.fields.map((field) => [field.customId, field.value]));
	}

	private async sendComponent(
		message: MessageView,
		data: Record<string, unknown>,
	): Promise<InteractionRecord> {
		const record = this.world.server.sendInteraction(
			this.id,
			message.channelId,
			{ type: InteractionType.MessageComponent, data },
			message.id,
		);
		await this.world.settle();
		return record;
	}
}

interface CommandDefinition {
	id: string;
	options?: (CommandOptionDefinition & { options?: CommandOptionDefinition[] })[];
}

interface CommandOptionDefinition {
	name: string;
	type: number;
	min_value?: number;
	max_value?: number;
}

/**
 * スラッシュコマンドの実行結果
 */
export class CommandRun {
	constructor(
		private world: World,
		private record: InteractionRecord,
	) {}

	get acknowledged(): boolean {
		return this.record.acknowledged;
	}

	/** 応答として全員に見えるメッセージの本文 */
	get publicMessages(): string[] {
		return this.record.publicMessages.map((message) => message.content);
	}

	/** 応答として実行者にだけ見えるメッセージの本文 */
	get privateMessages(): string[] {
		return this.record.privateMessages;
	}

	/** 全員に見える応答メッセージ（なければ例外を投げる） */
	get response(): MessageView {
		const [message] = this.record.publicMessages;
		if (!message) throw new Error("全員に見える応答がありません");
		return new MessageView(this.world.server.requireMessage(message.id));
	}
}

interface RawComponent {
	type: ComponentType;
	custom_id?: string;
	label?: string;
	options?: { label: string; value: string; default?: boolean }[];
	components?: RawComponent[];
}

/**
 * メッセージの表示内容
 */
export class MessageView {
	constructor(private state: MessageState) {}

	get id(): string {
		return this.state.id;
	}

	get channelId(): string {
		return this.state.channelId;
	}

	get content(): string {
		return this.state.content;
	}

	/** 表示されているボタンのカスタムID */
	get buttons(): string[] {
		return this.components
			.filter((component) => component.type === ComponentType.Button)
			.map((component) => component.custom_id ?? "");
	}

	/** 表示されているセレクトメニュー */
	selectMenu(customId: string): { label: string; value: string; selected: boolean }[] | undefined {
		const menu = this.components.find(
			(component) =>
				component.type === ComponentType.StringSelect && component.custom_id === customId,
		);
		return menu?.options?.map((option) => ({
			label: option.label,
			value: option.value,
			selected: option.default ?? false,
		}));
	}

	private get components(): RawComponent[] {
		return (this.state.components as RawComponent[]).flatMap((row) => row.components ?? []);
	}
}

/**
 * ルームのチャンネル構成
 */
export class RoomView {
	constructor(
		private world: World,
		readonly categoryId: string,
	) {}

	get exists(): boolean {
		return this.world.server.channels.has(this.categoryId);
	}

	private get children(): ChannelState[] {
		return [...this.world.server.channels.values()]
			.filter((channel) => channel.parentId === this.categoryId)
			.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
	}

	get textChannel(): ChannelState {
		const channel = this.children.find((child) => child.type === ChannelType.GuildText);
		if (!channel) throw new Error("ルームの専用チャットがありません");
		return channel;
	}

	/** メインのボイスチャンネル */
	get voiceChannel(): ChannelState {
		const [channel] = this.voiceChannels;
		if (!channel) throw new Error("ルームのボイスチャンネルがありません");
		return channel;
	}

	/** 追加のボイスチャンネル（作成順） */
	get additionalVoiceChannels(): ChannelState[] {
		return this.voiceChannels.slice(1);
	}

	/** メインと追加のボイスチャンネル（作成順） */
	get voiceChannels(): ChannelState[] {
		return this.children.filter((child) => child.type === ChannelType.GuildVoice);
	}
}

/**
 * スケジュールイベント
 */
export class ScheduledEvent {
	constructor(
		private world: World,
		readonly state: ScheduledEventState,
	) {}

	get id(): string {
		return this.state.id;
	}

	/** イベントの場所になっているチャンネル */
	get channelId(): string | null {
		return this.world.server.scheduledEvents.get(this.id)?.channelId ?? null;
	}

	async moveTo(channel: ChannelState): Promise<void> {
		this.world.server.updateScheduledEvent(this.id, { channelId: channel.id });
		await this.world.settle();
	}

	async setStatus(status: GuildScheduledEventStatus): Promise<void> {
		this.world.server.updateScheduledEvent(this.id, { status });
		await this.world.settle();
	}

	async delete(): Promise<void> {
		this.world.server.deleteScheduledEvent(this.id);
		await this.world.settle();
	}

	async subscribe(member: Member): Promise<void> {
		this.world.server.subscribeScheduledEvent(this.id, member.id, true);
		await this.world.settle();
	}

	async unsubscribe(member: Member): Promise<void> {
		this.world.server.subscribeScheduledEvent(this.id, member.id, false);
		await this.world.settle();
	}
}

export { GuildScheduledEventStatus };
