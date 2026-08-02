import type { Client, Message } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../bot/context";

/**
 * メッセージ作成時の処理
 * 募集チャンネルのロールメンションを監視し、投稿者が参加中のルームのゲームを切り替える
 * （ルームごとにコレクターを張るのではなく、Bot全体で1つのハンドラーが振り分ける）
 */
export const setupMessageCreateHandler = (client: Client, ctx: AppContext): void => {
	client.on(Events.MessageCreate, async (message: Message) => {
		try {
			if (!message.inGuild()) return;
			if (message.author.bot) return;
			if (message.channelId !== ctx.config.wantedChannelId) return;
			if (!message.mentions.everyone && message.mentions.roles.size === 0) return;

			// 投稿者が参加しているルームを特定
			const room = ctx.roomManager.findByMemberId(message.author.id);
			if (!room) return;

			const role = message.mentions.roles.first();
			const roleId = role?.id ?? message.guild.roles.everyone.id;

			// 投稿者がそのロールを持っている場合のみゲームを変更
			const member = message.member ?? (await message.guild.members.fetch(message.author.id));
			if (!member.roles.resolve(roleId)) return;

			await ctx.roomManager.changeGame(room, roleId);
		} catch (error) {
			console.error("[MessageCreate] Failed to handle wanted message:", error);
		}
	});
};
