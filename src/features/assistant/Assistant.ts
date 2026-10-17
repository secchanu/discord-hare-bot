import { cleanContent, type Message, MessageFlags, type Snowflake } from "discord.js";
import { DISCORD_LIMITS, TIME } from "../../constants";
import type { Room } from "../rooms/Room";
import type { Answer, Claude } from "./Claude";
import type { ConversationStore } from "./ConversationStore";

// 入力中の表示は約10秒で消えるので、その前に送り直す
const TYPING_INTERVAL = 8 * TIME.SECOND;

const FAILED_MESSAGE = "答えを用意できませんでした\n少し待ってからもう一度聞いてください";
const REFUSED_MESSAGE = "この質問には答えられません";

/**
 * ルームで Bot に聞かれたら、ゲームの質問に答える
 * 会話はルームごとに持ち、ルームを削除すると一緒に削除する
 */
export class Assistant {
	// ルームごとの質問の待ち行列
	// last は最後に受け付けた質問の処理
	// controller はルームの質問をまとめて中止するもの
	// 答えるたびに会話を読んで書き戻すので、同じルームの質問には1つずつ答える
	private queues = new Map<Snowflake, { last: Promise<void>; controller: AbortController }>();

	constructor(
		private claude: Claude,
		private store: ConversationStore,
	) {}

	/**
	 * ルームのメッセージが Bot への質問なら、ルームで受け付けた順に答える
	 */
	respond(message: Message<true>, room: Room): Promise<void> {
		const roomId = room.id;
		if (!roomId || !isToBot(message)) return Promise.resolve();

		const queue = this.queues.get(roomId) ?? {
			last: Promise.resolve(),
			controller: new AbortController(),
		};
		const { signal } = queue.controller;
		const current = queue.last.then(() => this.answer(message, room, signal));
		queue.last = current;
		this.queues.set(roomId, queue);
		void current.then(() => {
			if (this.queues.get(roomId)?.last === current) this.queues.delete(roomId);
		});
		return current;
	}

	/**
	 * ルームの会話を削除する
	 * 答えている途中の質問と待っている質問は、投稿する場所がなくなるので中止する
	 */
	forget(roomId: Snowflake): void {
		this.queues.get(roomId)?.controller.abort();
		this.queues.delete(roomId);
		this.store.delete(roomId);
	}

	/**
	 * 質問に答えて、答えを投稿する
	 * 例外は投げない
	 */
	private async answer(question: Message<true>, room: Room, signal: AbortSignal): Promise<void> {
		const roomId = room.id;
		if (!roomId || signal.aborted || !(await isQuestion(question))) return;

		const stopTyping = keepTyping(question);
		let content: string;
		try {
			const conversation = this.store.get(roomId) ?? { gameId: null, messages: [] };
			const answer = await this.claude.answer(
				conversation,
				await formatQuestion(question),
				{
					serverName: question.guild.name,
					botName: question.guild.members.me?.displayName ?? question.client.user.displayName,
					game: room.game,
				},
				signal,
			);
			if (!answer.refused) this.store.set(roomId, answer.conversation);
			content = formatAnswer(answer);
		} catch (error) {
			if (signal.aborted) return;
			console.error("[Assistant] Failed to answer:", error);
			content = FAILED_MESSAGE;
		} finally {
			stopTyping();
		}

		try {
			await post(question, content);
		} catch (error) {
			console.error("[Assistant] Failed to post answer:", error);
		}
	}
}

/**
 * Bot に向けたメッセージか
 * 本文で Bot をメンションしたものと、Bot の投稿に Bot へ通知して返信したものが Bot に向けたメッセージ
 * Bot へ通知する返信は、本文にメンションがなくても Bot がメンションに入る
 */
function isToBot(message: Message<true>): boolean {
	const botId = message.client.user.id;
	return (
		message.mentions.parsedUsers.has(botId) ||
		(message.mentions.repliedUser?.id === botId && message.mentions.users.has(botId))
	);
}

/**
 * Bot に向けたメッセージが質問か
 * Bot の投稿への返信は、答えへの返信だけが質問
 * Bot がコマンドの応答のほかに投稿するのは答えだけ
 */
async function isQuestion(message: Message<true>): Promise<boolean> {
	if (message.mentions.parsedUsers.has(message.client.user.id)) return true;
	const target = await message.fetchReference().catch(() => null);
	return target !== null && !target.interactionMetadata;
}

/**
 * 質問を「表示名: 本文」の形にする
 * Bot 以外の発言への返信なら、返信先を「> 」で始まる行で前に付ける
 */
async function formatQuestion(question: Message<true>): Promise<string> {
	const lines = [`${nameOf(question)}: ${textOf(question)}`];
	if (question.reference?.messageId) {
		const target = await question.fetchReference().catch(() => null);
		if (target && target.author.id !== question.client.user.id) {
			lines.unshift(
				...`${nameOf(target)}: ${textOf(target)}`.split("\n").map((line) => `> ${line}`),
			);
		}
	}
	return lines.join("\n");
}

/**
 * メンションを名前にした本文
 * メンションの位置は、どこからが Bot への質問かを示すので残す
 */
function textOf(message: Message<true>): string {
	return cleanContent(message.content, message.channel);
}

function nameOf(message: Message): string {
	return message.member?.displayName ?? message.author.displayName;
}

/**
 * 答えを投稿する本文にする
 */
function formatAnswer(answer: Answer): string {
	if (answer.refused) return REFUSED_MESSAGE;

	// 出典はサイトごとに並べる
	const sites = new Map<string, string>();
	for (const url of answer.sources.filter((source) => URL.canParse(source))) {
		const host = new URL(url).hostname.replace(/^www\./, "");
		// サイトは www. を除いたホスト名で見分け、最初のページで代表させる
		if (!sites.has(host)) sites.set(host, url);
	}
	if (sites.size === 0) return answer.text;

	// リンクの括弧は Discord のリンクの記法と衝突するので、URL ではパーセントエンコードする
	const links = [...sites].map(
		([host, url]) => `[${host}](${url.replaceAll("(", "%28").replaceAll(")", "%29")})`,
	);
	// 出典は本文と見分けが付くよう、サブテキストの1行にする
	return `${answer.text}\n\n-# 出典: ${links.join(" · ")}`;
}

/**
 * 質問に返信する
 * 長い本文は分けて、2つ目からは返信にせず投稿する
 * 質問が削除されていても、返信先なしで投稿する
 */
async function post(question: Message<true>, content: string): Promise<void> {
	const [first, ...rest] = splitMessage(content);
	await question.reply({
		content: first,
		flags: MessageFlags.SuppressEmbeds,
		allowedMentions: { parse: [], repliedUser: true },
		failIfNotExists: false,
	});
	for (const chunk of rest) {
		await question.channel.send({
			content: chunk,
			flags: MessageFlags.SuppressEmbeds,
			allowedMentions: { parse: [] },
		});
	}
}

/**
 * 本文を行の区切りで分け、Discord のメッセージの文字数の上限に収める
 * 上限を超える行は、上限の文字数ごとに分ける
 */
function splitMessage(text: string): string[] {
	const lines = text
		.split("\n")
		.flatMap((line) =>
			Array.from(
				{ length: Math.max(1, Math.ceil(line.length / DISCORD_LIMITS.MAX_MESSAGE_LENGTH)) },
				(_, i) =>
					line.slice(
						i * DISCORD_LIMITS.MAX_MESSAGE_LENGTH,
						(i + 1) * DISCORD_LIMITS.MAX_MESSAGE_LENGTH,
					),
			),
		);

	const chunks: string[] = [];
	let current = "";
	for (const line of lines) {
		if (current && current.length + 1 + line.length > DISCORD_LIMITS.MAX_MESSAGE_LENGTH) {
			chunks.push(current);
			current = line;
		} else {
			current = current ? `${current}\n${line}` : line;
		}
	}
	chunks.push(current);
	return chunks;
}

/**
 * 止めるまで、質問のチャンネルに入力中の表示を出す
 * 入力中の表示を出せなくても、例外は投げない
 */
function keepTyping(question: Message<true>): () => void {
	const send = async () => {
		try {
			// チャンネルが削除されると、channel は null になる
			await question.channel.sendTyping();
		} catch {}
	};
	void send();
	const timer = setInterval(send, TYPING_INTERVAL);
	return () => clearInterval(timer);
}
