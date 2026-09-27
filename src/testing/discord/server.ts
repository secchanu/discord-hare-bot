import {
	ChannelType,
	type Client,
	DiscordAPIError,
	GuildScheduledEventStatus,
	InteractionResponseType,
	MessageFlags,
	OverwriteType,
	PermissionFlagsBits,
	RESTJSONErrorCodes,
	SnowflakeUtil,
	Status,
} from "discord.js";

/**
 * discord.js から Discord への API 呼び出し
 */
export interface ApiRequest {
	method: string;
	fullRoute: string;
	body?: unknown;
	query?: URLSearchParams;
}

export interface RoleState {
	id: string;
	name: string;
}

export interface MemberState {
	id: string;
	name: string;
	bot: boolean;
	roleIds: string[];
}

export interface OverwriteState {
	id: string;
	type: OverwriteType;
	allow: bigint;
	deny: bigint;
}

export interface ChannelState {
	id: string;
	type: ChannelType;
	name: string;
	parentId: string | null;
	position: number;
	overwrites: OverwriteState[];
	/** 付けられた名前の履歴（作成時の名前を含む） */
	nameHistory: string[];
}

export interface MessageState {
	id: string;
	channelId: string;
	authorId: string;
	content: string;
	components: unknown[];
	/** 実行者にだけ見えるメッセージの宛先。全員に見える場合は null */
	visibleTo: string | null;
	mentionRoleIds: string[];
	mentionEveryone: boolean;
	createdAt: number;
	editedAt: number | null;
}

export interface ScheduledEventState {
	id: string;
	name: string;
	channelId: string | null;
	status: GuildScheduledEventStatus;
	subscriberIds: string[];
}

interface InteractionState {
	id: string;
	token: string;
	userId: string;
	channelId: string;
	createdAt: number;
	acknowledged: boolean;
	/** 応答として作られた、または操作元のメッセージ */
	messageId: string | null;
}

/**
 * 開かれているモーダル
 */
export interface OpenModal {
	customId: string;
	/** モーダルを開いた操作の対象メッセージ */
	messageId: string | null;
	channelId: string;
	fields: { customId: string; value: string }[];
}

type RequestMatcher = (request: ApiRequest) => boolean;

/**
 * メソッドとルートで API 呼び出しを選ぶ
 */
export function apiRequest(method: string, route: RegExp): RequestMatcher {
	return (request) => request.method === method && route.test(request.fullRoute);
}

// インタラクショントークンの有効期限
const INTERACTION_TOKEN_LIFETIME = 15 * 60 * 1000;
// インタラクションへの最初の応答の期限
const INTERACTION_RESPONSE_DEADLINE = 3 * 1000;

/**
 * 1つのサーバーだけを持つ偽の Discord
 * discord.js の API 呼び出しを受けて状態を更新し、実際の Discord と同じゲートウェイイベントを送る
 */
export class FakeDiscordServer {
	readonly guildId = SnowflakeUtil.generate().toString();
	readonly applicationId = SnowflakeUtil.generate().toString();
	readonly botUserId = this.applicationId;

	readonly roles = new Map<string, RoleState>();
	readonly members = new Map<string, MemberState>();
	readonly channels = new Map<string, ChannelState>();
	readonly messages = new Map<string, MessageState>();
	readonly scheduledEvents = new Map<string, ScheduledEventState>();
	/** メンバーが接続しているボイスチャンネル */
	readonly voice = new Map<string, string>();
	/** メンバーごとに開かれているモーダル */
	readonly openModals = new Map<string, OpenModal>();
	/** 受け付けた API 呼び出しの記録 */
	readonly requests: ApiRequest[] = [];

	private interactions = new Map<string, InteractionState>();
	/** メッセージを作ったインタラクションのトークン */
	private messageOrigin = new Map<string, string>();
	private registeredCommands: Record<string, unknown>[] = [];
	private failures: { matcher: RequestMatcher; code: number }[] = [];
	private holds: { matcher: RequestMatcher; released: Promise<void> }[] = [];
	private client: Client | null = null;

	constructor() {
		this.roles.set(this.guildId, { id: this.guildId, name: "@everyone" });
		this.members.set(this.botUserId, {
			id: this.botUserId,
			name: "hare",
			bot: true,
			roleIds: [],
		});
	}

	/**
	 * Bot のクライアントを接続する
	 * API 呼び出しをこのサーバーで受け、ログイン直後と同じ状態を作る
	 */
	connect(client: Client): void {
		this.client = client;
		client.rest.request = (options) => this.handle(options as ApiRequest);
		client.ws.status = Status.Ready;

		this.dispatch("READY", {
			v: 10,
			user: this.rawUser(this.botUserId),
			guilds: [],
			session_id: "session",
			resume_gateway_url: "wss://gateway.invalid",
			application: { id: this.applicationId, flags: 0 },
		});
		this.dispatch("GUILD_CREATE", this.rawGuild());
	}

	/**
	 * Bot を切断する（切断中の変化は、次の接続時の状態として Bot に届く）
	 */
	disconnect(): void {
		this.client = null;
	}

	/**
	 * ゲートウェイイベントを Bot に送る
	 */
	dispatch(type: string, data: unknown): void {
		if (!this.client) return;
		// discord.js がゲートウェイから受け取ったイベントを処理する入口
		const ws = this.client.ws as unknown as {
			handlePacket(packet: { t: string; d: unknown }, shard: unknown): void;
		};
		ws.handlePacket({ t: type, d: data }, { id: 0, checkReady: () => {} });
	}

	/**
	 * 登録されたコマンドの定義
	 */
	command(name: string): Record<string, unknown> | undefined {
		return this.registeredCommands.find((command) => command.name === name);
	}

	nextId(): string {
		return SnowflakeUtil.generate().toString();
	}

	addRole(name: string): RoleState {
		const role = { id: this.nextId(), name };
		this.roles.set(role.id, role);
		this.dispatch("GUILD_ROLE_CREATE", { guild_id: this.guildId, role: this.rawRole(role) });
		return role;
	}

	addMember(name: string, roleIds: string[] = [], bot = false): MemberState {
		const member = { id: this.nextId(), name, bot, roleIds };
		this.members.set(member.id, member);
		this.dispatch("GUILD_MEMBER_ADD", { guild_id: this.guildId, ...this.rawMember(member.id) });
		return member;
	}

	addChannel(options: {
		type: ChannelType;
		name: string;
		parentId?: string | null;
		overwrites?: OverwriteState[];
	}): ChannelState {
		const channel: ChannelState = {
			id: this.nextId(),
			type: options.type,
			name: options.name,
			parentId: options.parentId ?? null,
			position: this.channels.size,
			overwrites: options.overwrites ?? [],
			nameHistory: [options.name],
		};
		this.channels.set(channel.id, channel);
		this.dispatch("CHANNEL_CREATE", this.rawChannel(channel));
		return channel;
	}

	/**
	 * メンバーのボイスチャンネル接続を変える（null で切断）
	 */
	setVoiceChannel(memberId: string, channelId: string | null): void {
		if (channelId) this.voice.set(memberId, channelId);
		else this.voice.delete(memberId);
		this.dispatch("VOICE_STATE_UPDATE", this.rawVoiceState(memberId));
	}

	postMessage(
		authorId: string,
		channelId: string,
		options: { content?: string; mentionRoleIds?: string[]; mentionEveryone?: boolean },
	): MessageState {
		const message = this.createMessage({
			channelId,
			authorId,
			content: options.content ?? "",
			components: [],
			visibleTo: null,
			mentionRoleIds: options.mentionRoleIds ?? [],
			mentionEveryone: options.mentionEveryone ?? false,
		});
		this.dispatch("MESSAGE_CREATE", this.rawMessage(message));
		return message;
	}

	createScheduledEvent(name: string, channelId: string): ScheduledEventState {
		const event: ScheduledEventState = {
			id: this.nextId(),
			name,
			channelId,
			status: GuildScheduledEventStatus.Scheduled,
			subscriberIds: [],
		};
		this.scheduledEvents.set(event.id, event);
		this.dispatch("GUILD_SCHEDULED_EVENT_CREATE", this.rawScheduledEvent(event));
		return event;
	}

	updateScheduledEvent(
		eventId: string,
		changes: Partial<Pick<ScheduledEventState, "channelId" | "status" | "name">>,
	): void {
		const event = this.requireScheduledEvent(eventId);
		Object.assign(event, changes);
		this.dispatch("GUILD_SCHEDULED_EVENT_UPDATE", this.rawScheduledEvent(event));
	}

	deleteScheduledEvent(eventId: string): void {
		const event = this.requireScheduledEvent(eventId);
		this.scheduledEvents.delete(eventId);
		this.dispatch("GUILD_SCHEDULED_EVENT_DELETE", this.rawScheduledEvent(event));
	}

	subscribeScheduledEvent(eventId: string, memberId: string, subscribed: boolean): void {
		const event = this.requireScheduledEvent(eventId);
		event.subscriberIds = subscribed
			? [...event.subscriberIds, memberId]
			: event.subscriberIds.filter((id) => id !== memberId);
		this.dispatch(
			subscribed ? "GUILD_SCHEDULED_EVENT_USER_ADD" : "GUILD_SCHEDULED_EVENT_USER_REMOVE",
			{ guild_scheduled_event_id: eventId, user_id: memberId, guild_id: this.guildId },
		);
	}

	/**
	 * インタラクションを送り、その記録を返す
	 */
	sendInteraction(
		userId: string,
		channelId: string,
		body: Record<string, unknown>,
		sourceMessageId: string | null = null,
	): InteractionRecord {
		const state: InteractionState = {
			id: this.nextId(),
			token: `token-${this.nextId()}`,
			userId,
			channelId,
			createdAt: Date.now(),
			acknowledged: false,
			messageId: sourceMessageId,
		};
		this.interactions.set(state.token, state);

		const channel = this.requireChannel(channelId);
		this.dispatch("INTERACTION_CREATE", {
			id: state.id,
			application_id: this.applicationId,
			token: state.token,
			version: 1,
			guild_id: this.guildId,
			channel_id: channelId,
			channel: { id: channelId, type: channel.type },
			member: { ...this.rawMember(userId), permissions: "0" },
			app_permissions: "0",
			locale: "ja",
			guild_locale: "ja",
			entitlements: [],
			authorizing_integration_owners: {},
			context: 0,
			attachment_size_limit: 10_000_000,
			...(sourceMessageId
				? { message: this.rawMessage(this.requireMessage(sourceMessageId)) }
				: {}),
			...body,
		});

		return new InteractionRecord(this, state);
	}

	/**
	 * インタラクションが作ったメッセージ
	 */
	messagesOf(interaction: InteractionState): MessageState[] {
		return [...this.messages.values()].filter(
			(message) => this.messageOrigin.get(message.id) === interaction.token,
		);
	}

	/**
	 * 条件に合う API 呼び出しを失敗させる
	 * @returns 失敗させるのをやめる関数
	 */
	fail(matcher: RequestMatcher, code: number = RESTJSONErrorCodes.MissingPermissions): () => void {
		const failure = { matcher, code };
		this.failures.push(failure);
		return () => {
			this.failures = this.failures.filter((item) => item !== failure);
		};
	}

	/**
	 * 条件に合う API 呼び出しを、解放するまで待たせる
	 * @returns 解放する関数
	 */
	hold(matcher: RequestMatcher): () => void {
		let release!: () => void;
		const released = new Promise<void>((resolve) => {
			release = resolve;
		});
		const hold = { matcher, released };
		this.holds.push(hold);
		return () => {
			this.holds = this.holds.filter((item) => item !== hold);
			release();
		};
	}

	private async handle(request: ApiRequest): Promise<unknown> {
		this.requests.push(request);

		const hold = this.holds.find((item) => item.matcher(request));
		if (hold) await hold.released;

		const failure = this.failures.find((item) => item.matcher(request));
		if (failure) throw this.error(request, failure.code, 403);

		return this.route(request);
	}

	private route(request: ApiRequest): unknown {
		const { method, fullRoute } = request;
		const body = (request.body ?? {}) as Record<string, unknown>;
		const route = (pattern: RegExp): string[] | null => fullRoute.match(pattern)?.slice(1) ?? null;
		let params: string[] | null;

		if (method === "POST" && (params = route(/^\/interactions\/(\d+)\/([^/]+)\/callback$/))) {
			return this.interactionCallback(request, params[1], body);
		}
		if ((params = route(/^\/webhooks\/(\d+)\/([^/]+)\/messages\/(?:@|%40)original$/))) {
			return this.originalMessage(request, params[1], body);
		}
		if (method === "POST" && (params = route(/^\/webhooks\/(\d+)\/([^/]+)$/))) {
			return this.followUp(request, params[1], body);
		}
		if (method === "PATCH" && (params = route(/^\/channels\/(\d+)\/messages\/(\d+)$/))) {
			const message = this.requireMessage(params[1], request);
			this.applyMessageBody(message, body);
			return this.rawMessage(message);
		}
		if (method === "GET" && (params = route(/^\/channels\/(\d+)\/messages$/))) {
			const limit = Number(request.query?.get("limit") ?? 50);
			return [...this.messages.values()]
				.filter((message) => message.channelId === params?.[0] && message.visibleTo === null)
				.sort((a, b) => b.createdAt - a.createdAt)
				.slice(0, limit)
				.map((message) => this.rawMessage(message));
		}
		if (method === "POST" && route(/^\/guilds\/(\d+)\/channels$/)) {
			return this.rawChannel(this.createChannelFromBody(body));
		}
		if (method === "DELETE" && (params = route(/^\/channels\/(\d+)$/))) {
			return this.deleteChannel(params[0], request);
		}
		if (method === "PATCH" && (params = route(/^\/channels\/(\d+)$/))) {
			const channel = this.requireChannel(params[0], request);
			if (typeof body.name === "string") {
				channel.name = body.name;
				channel.nameHistory.push(body.name);
			}
			if (Array.isArray(body.permission_overwrites)) {
				channel.overwrites = body.permission_overwrites.map(parseOverwrite);
			}
			return this.rawChannel(channel);
		}
		if (method === "PUT" && (params = route(/^\/channels\/(\d+)\/permissions\/(\d+)$/))) {
			const channel = this.requireChannel(params[0], request);
			const overwrite = parseOverwrite(body);
			channel.overwrites = [
				...channel.overwrites.filter((item) => item.id !== overwrite.id),
				overwrite,
			];
			this.dispatchLater("CHANNEL_UPDATE", this.rawChannel(channel));
			return undefined;
		}
		if (method === "PATCH" && (params = route(/^\/guilds\/(\d+)\/members\/(\d+)$/))) {
			return this.editMember(params[1], body, request);
		}
		if (method === "GET" && (params = route(/^\/guilds\/(\d+)\/members\/(\d+)$/))) {
			if (!this.members.has(params[1])) {
				throw this.error(request, RESTJSONErrorCodes.UnknownMember, 404);
			}
			return this.rawMember(params[1]);
		}
		if (method === "GET" && (params = route(/^\/guilds\/(\d+)\/scheduled-events\/(\d+)$/))) {
			return this.rawScheduledEvent(this.requireScheduledEvent(params[1], request));
		}
		if (method === "PATCH" && (params = route(/^\/guilds\/(\d+)\/scheduled-events\/(\d+)$/))) {
			const event = this.requireScheduledEvent(params[1], request);
			if ("channel_id" in body) event.channelId = (body.channel_id as string | null) ?? null;
			const raw = this.rawScheduledEvent(event);
			this.dispatchLater("GUILD_SCHEDULED_EVENT_UPDATE", raw);
			return raw;
		}
		if (method === "GET" && (params = route(/^\/guilds\/(\d+)\/scheduled-events\/(\d+)\/users$/))) {
			const event = this.requireScheduledEvent(params[1], request);
			return event.subscriberIds.map((id) => ({
				guild_scheduled_event_id: event.id,
				user: this.rawUser(id),
			}));
		}
		if (method === "PUT" && route(/^\/applications\/(\d+)\/guilds\/(\d+)\/commands$/)) {
			this.registeredCommands = (request.body as Record<string, unknown>[]).map((command) => ({
				...command,
				id: this.nextId(),
				application_id: this.applicationId,
				guild_id: this.guildId,
				version: "1",
			}));
			return this.registeredCommands;
		}

		throw new Error(`偽の Discord サーバーが扱わない API 呼び出しです: ${method} ${fullRoute}`);
	}

	private interactionCallback(
		request: ApiRequest,
		token: string,
		body: Record<string, unknown>,
	): unknown {
		const interaction = this.requireInteraction(token, request);
		if (interaction.acknowledged) {
			throw this.error(request, RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged, 400);
		}
		if (Date.now() - interaction.createdAt > INTERACTION_RESPONSE_DEADLINE) {
			throw this.error(request, RESTJSONErrorCodes.UnknownInteraction, 404);
		}
		interaction.acknowledged = true;

		const data = (body.data ?? {}) as Record<string, unknown>;
		const ephemeral = (Number(data.flags ?? 0) & MessageFlags.Ephemeral) !== 0;

		switch (body.type) {
			case InteractionResponseType.ChannelMessageWithSource:
			case InteractionResponseType.DeferredChannelMessageWithSource: {
				const message = this.createMessage({
					channelId: interaction.channelId,
					authorId: this.botUserId,
					content: (data.content as string | undefined) ?? "",
					components: (data.components as unknown[] | undefined) ?? [],
					visibleTo: ephemeral ? interaction.userId : null,
					mentionRoleIds: [],
					mentionEveryone: false,
				});
				this.messageOrigin.set(message.id, token);
				interaction.messageId = message.id;
				break;
			}
			case InteractionResponseType.DeferredMessageUpdate:
				break;
			case InteractionResponseType.UpdateMessage:
				this.applyMessageBody(this.requireMessage(interaction.messageId ?? "", request), data);
				break;
			case InteractionResponseType.Modal:
				this.openModals.set(interaction.userId, {
					customId: data.custom_id as string,
					messageId: interaction.messageId,
					channelId: interaction.channelId,
					fields: collectTextInputs(data.components as unknown[]),
				});
				break;
			default:
				throw new Error(`偽の Discord サーバーが扱わない応答の種類です: ${String(body.type)}`);
		}
		return undefined;
	}

	private originalMessage(request: ApiRequest, token: string, body: Record<string, unknown>) {
		const interaction = this.requireLiveInteraction(token, request);
		const message = this.requireMessage(interaction.messageId ?? "", request);

		if (request.method === "DELETE") {
			this.messages.delete(message.id);
			this.dispatchLater("MESSAGE_DELETE", {
				id: message.id,
				channel_id: message.channelId,
				guild_id: this.guildId,
			});
			return undefined;
		}
		this.applyMessageBody(message, body);
		return this.rawMessage(message);
	}

	private followUp(request: ApiRequest, token: string, body: Record<string, unknown>) {
		const interaction = this.requireLiveInteraction(token, request);
		const ephemeral = (Number(body.flags ?? 0) & MessageFlags.Ephemeral) !== 0;
		const message = this.createMessage({
			channelId: interaction.channelId,
			authorId: this.botUserId,
			content: (body.content as string | undefined) ?? "",
			components: (body.components as unknown[] | undefined) ?? [],
			visibleTo: ephemeral ? interaction.userId : null,
			mentionRoleIds: [],
			mentionEveryone: false,
		});
		this.messageOrigin.set(message.id, token);
		return this.rawMessage(message);
	}

	private createChannelFromBody(body: Record<string, unknown>): ChannelState {
		const channel: ChannelState = {
			id: this.nextId(),
			type: body.type as ChannelType,
			name: body.name as string,
			parentId: (body.parent_id as string | undefined) ?? null,
			position: Number(body.position ?? this.channels.size),
			overwrites: ((body.permission_overwrites as unknown[] | undefined) ?? []).map(parseOverwrite),
			nameHistory: [body.name as string],
		};
		this.channels.set(channel.id, channel);
		return channel;
	}

	private deleteChannel(channelId: string, request: ApiRequest): unknown {
		const channel = this.requireChannel(channelId, request);
		this.channels.delete(channelId);

		// チャンネルのメッセージは消え、接続していたメンバーは切断される
		const messageIds = [...this.messages.values()]
			.filter((message) => message.channelId === channelId)
			.map((message) => message.id);
		for (const messageId of messageIds) this.messages.delete(messageId);

		const memberIds = [...this.voice]
			.filter(([, voiceChannelId]) => voiceChannelId === channelId)
			.map(([memberId]) => memberId);
		for (const memberId of memberIds) {
			this.voice.delete(memberId);
			this.dispatchLater("VOICE_STATE_UPDATE", this.rawVoiceState(memberId));
		}

		return this.rawChannel(channel);
	}

	private editMember(memberId: string, body: Record<string, unknown>, request: ApiRequest) {
		if (!this.members.has(memberId)) {
			throw this.error(request, RESTJSONErrorCodes.UnknownMember, 404);
		}
		if ("channel_id" in body) {
			if (!this.voice.has(memberId)) {
				throw this.error(request, RESTJSONErrorCodes.TargetUserIsNotConnectedToVoice, 400);
			}
			const channelId = body.channel_id as string | null;
			if (channelId) {
				this.requireChannel(channelId, request);
				this.voice.set(memberId, channelId);
			} else {
				this.voice.delete(memberId);
			}
			this.dispatchLater("VOICE_STATE_UPDATE", this.rawVoiceState(memberId));
		}
		return this.rawMember(memberId);
	}

	private applyMessageBody(message: MessageState, body: Record<string, unknown>): void {
		if (typeof body.content === "string") message.content = body.content;
		if (Array.isArray(body.components)) message.components = body.components;
		message.editedAt = Date.now();
	}

	private createMessage(fields: Omit<MessageState, "id" | "createdAt" | "editedAt">): MessageState {
		const message: MessageState = {
			...fields,
			id: this.nextId(),
			createdAt: Date.now(),
			editedAt: null,
		};
		this.messages.set(message.id, message);
		return message;
	}

	/**
	 * API の応答を返した後にゲートウェイイベントを送る
	 */
	private dispatchLater(type: string, data: unknown): void {
		setImmediate(() => this.dispatch(type, data));
	}

	requireChannel(channelId: string, request?: ApiRequest): ChannelState {
		const channel = this.channels.get(channelId);
		if (!channel) {
			if (request) throw this.error(request, RESTJSONErrorCodes.UnknownChannel, 404);
			throw new Error(`チャンネルがありません: ${channelId}`);
		}
		return channel;
	}

	requireMessage(messageId: string, request?: ApiRequest): MessageState {
		const message = this.messages.get(messageId);
		if (!message) {
			if (request) throw this.error(request, RESTJSONErrorCodes.UnknownMessage, 404);
			throw new Error(`メッセージがありません: ${messageId}`);
		}
		return message;
	}

	private requireScheduledEvent(eventId: string, request?: ApiRequest): ScheduledEventState {
		const event = this.scheduledEvents.get(eventId);
		if (!event) {
			if (request) throw this.error(request, RESTJSONErrorCodes.UnknownGuildScheduledEvent, 404);
			throw new Error(`イベントがありません: ${eventId}`);
		}
		return event;
	}

	private requireInteraction(token: string, request: ApiRequest): InteractionState {
		const interaction = this.interactions.get(token);
		if (!interaction) throw this.error(request, RESTJSONErrorCodes.UnknownInteraction, 404);
		return interaction;
	}

	/**
	 * トークンの有効期限内のインタラクション
	 */
	private requireLiveInteraction(token: string, request: ApiRequest): InteractionState {
		const interaction = this.requireInteraction(token, request);
		if (Date.now() - interaction.createdAt > INTERACTION_TOKEN_LIFETIME) {
			throw this.error(request, RESTJSONErrorCodes.InvalidWebhookToken, 401);
		}
		return interaction;
	}

	private error(request: ApiRequest, code: number, status: number): DiscordAPIError {
		return new DiscordAPIError(
			{ code, message: `Error ${code}` },
			code,
			status,
			request.method,
			request.fullRoute,
			{ body: request.body },
		);
	}

	rawUser(userId: string) {
		const member = this.members.get(userId);
		return {
			id: userId,
			username: member?.name ?? "unknown",
			global_name: member?.name ?? null,
			discriminator: "0",
			avatar: null,
			bot: member?.bot ?? false,
		};
	}

	rawMember(userId: string) {
		const member = this.members.get(userId);
		return {
			user: this.rawUser(userId),
			nick: null,
			avatar: null,
			roles: member?.roleIds ?? [],
			joined_at: new Date(0).toISOString(),
			premium_since: null,
			deaf: false,
			mute: false,
			flags: 0,
			pending: false,
			communication_disabled_until: null,
		};
	}

	rawRole(role: RoleState) {
		return {
			id: role.id,
			name: role.name,
			color: 0,
			hoist: false,
			icon: null,
			unicode_emoji: null,
			position: 0,
			permissions: "0",
			managed: false,
			mentionable: true,
			flags: 0,
		};
	}

	rawChannel(channel: ChannelState) {
		return {
			id: channel.id,
			type: channel.type,
			guild_id: this.guildId,
			name: channel.name,
			parent_id: channel.parentId,
			position: channel.position,
			permission_overwrites: channel.overwrites.map((overwrite) => ({
				id: overwrite.id,
				type: overwrite.type,
				allow: overwrite.allow.toString(),
				deny: overwrite.deny.toString(),
			})),
			nsfw: false,
			bitrate: 64_000,
			user_limit: 0,
			rtc_region: null,
			rate_limit_per_user: 0,
			topic: null,
			last_message_id: null,
		};
	}

	rawMessage(message: MessageState) {
		return {
			id: message.id,
			channel_id: message.channelId,
			guild_id: this.guildId,
			author: this.rawUser(message.authorId),
			member: this.rawMember(message.authorId),
			content: message.content,
			timestamp: new Date(message.createdAt).toISOString(),
			edited_timestamp: message.editedAt === null ? null : new Date(message.editedAt).toISOString(),
			tts: false,
			mention_everyone: message.mentionEveryone,
			mentions: [],
			mention_roles: message.mentionRoleIds,
			attachments: [],
			embeds: [],
			pinned: false,
			type: 0,
			flags: message.visibleTo === null ? 0 : MessageFlags.Ephemeral,
			components: message.components,
		};
	}

	rawVoiceState(userId: string) {
		return {
			guild_id: this.guildId,
			channel_id: this.voice.get(userId) ?? null,
			user_id: userId,
			member: this.rawMember(userId),
			session_id: `voice-${userId}`,
			deaf: false,
			mute: false,
			self_deaf: false,
			self_mute: false,
			self_video: false,
			suppress: false,
			request_to_speak_timestamp: null,
		};
	}

	rawScheduledEvent(event: ScheduledEventState) {
		return {
			id: event.id,
			guild_id: this.guildId,
			channel_id: event.channelId,
			creator_id: null,
			name: event.name,
			description: null,
			scheduled_start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
			scheduled_end_time: null,
			privacy_level: 2,
			status: event.status,
			entity_type: 2,
			entity_id: null,
			entity_metadata: null,
			user_count: event.subscriberIds.length,
			image: null,
		};
	}

	private rawGuild() {
		return {
			id: this.guildId,
			name: "テストサーバー",
			icon: null,
			owner_id: this.botUserId,
			features: [],
			emojis: [],
			stickers: [],
			premium_tier: 0,
			roles: [...this.roles.values()].map((role) => this.rawRole(role)),
			channels: [...this.channels.values()].map((channel) => this.rawChannel(channel)),
			members: [...this.members.keys()].map((id) => this.rawMember(id)),
			voice_states: [...this.voice.keys()].map((id) => this.rawVoiceState(id)),
			guild_scheduled_events: [...this.scheduledEvents.values()].map((event) =>
				this.rawScheduledEvent(event),
			),
		};
	}
}

/**
 * 送ったインタラクションへの Bot の応答
 */
export class InteractionRecord {
	constructor(
		private server: FakeDiscordServer,
		private state: InteractionState,
	) {}

	/** Bot が応答したか */
	get acknowledged(): boolean {
		return this.state.acknowledged;
	}

	/** 応答として作られ、全員に見えるまま残っているメッセージ */
	get publicMessages(): MessageState[] {
		return this.server.messagesOf(this.state).filter((message) => message.visibleTo === null);
	}

	/** 応答として作られ、操作した人にだけ見えるメッセージの本文 */
	get privateMessages(): string[] {
		return this.server
			.messagesOf(this.state)
			.filter((message) => message.visibleTo !== null)
			.map((message) => message.content);
	}
}

/**
 * ユーザーから見たチャンネルの閲覧可否
 * 権限の上書きのうち @everyone とメンバー個別の設定だけを評価する
 */
export function canView(channel: ChannelState, everyoneId: string, memberId: string): boolean {
	let visible = true;
	for (const id of [everyoneId, memberId]) {
		const overwrite = channel.overwrites.find((item) => item.id === id);
		if (!overwrite) continue;
		if (overwrite.deny & PermissionFlagsBits.ViewChannel) visible = false;
		if (overwrite.allow & PermissionFlagsBits.ViewChannel) visible = true;
	}
	return visible;
}

function parseOverwrite(raw: unknown): OverwriteState {
	const overwrite = raw as { id: string; type: OverwriteType; allow?: string; deny?: string };
	return {
		id: overwrite.id,
		type: overwrite.type,
		allow: BigInt(overwrite.allow ?? 0),
		deny: BigInt(overwrite.deny ?? 0),
	};
}

function collectTextInputs(components: unknown[] = []): { customId: string; value: string }[] {
	return components.flatMap((row) =>
		((row as { components?: unknown[] }).components ?? []).map((component) => {
			const input = component as { custom_id: string; value?: string };
			return { customId: input.custom_id, value: input.value ?? "" };
		}),
	);
}
