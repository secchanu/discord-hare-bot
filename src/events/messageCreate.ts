import type { Client, Message } from "discord.js";
import { Events } from "discord.js";
import type { AppContext } from "../bot/context";

/**
 * 募集チャンネルへの投稿時に、投稿者が参加しているルームのゲームをメンションしたロールに切り替える
 */
export const setupMessageCreateHandler = (client: Client, ctx: AppContext): void => {
	client.on(Events.MessageCreate, async (message: Message) => {
		try {
			if (!message.inGuild()) return;
			if (message.author.bot) return;
			if (message.channelId !== ctx.config.wantedChannelId) return;
			if (!message.mentions.everyone && message.mentions.roles.size === 0) return;

			const room = ctx.roomManager.findByMemberId(message.author.id);
			if (!room) return;

			const role = message.mentions.roles.first();
			const roleId = role?.id ?? message.guild.roles.everyone.id;

			// ゲームにするのは投稿者が持っているロールだけ
			const member = message.member ?? (await message.guild.members.fetch(message.author.id));
			if (!member.roles.resolve(roleId)) return;

			await ctx.roomManager.changeGame(room, roleId);
		} catch (error) {
			console.error("[MessageCreate] Failed to handle wanted message:", error);
		}
	});
};
