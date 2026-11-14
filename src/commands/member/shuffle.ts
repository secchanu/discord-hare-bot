import type { GuildMember } from "discord.js";
import type { AppContext } from "../../bot/context";
import { ROOM_ONLY_MESSAGE, replyError } from "../helpers";
import { getRoomFromVoiceAndTextChannel } from "../helpers/room";
import type { GuildCommandInteraction } from "../types";

/**
 * /member shuffle サブコマンド
 * ボイスチャンネルのメンバーをランダムに並び替える
 */
export async function handleShuffle(
	interaction: GuildCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	const room = getRoomFromVoiceAndTextChannel(interaction, ctx.roomManager);
	const channel = interaction.member.voice.channel;
	if (!room || !channel) {
		await replyError(interaction, ROOM_ONLY_MESSAGE);
		return;
	}

	const members = channel.members.filter((m: GuildMember) => !m.user.bot);

	await interaction.deferReply();

	const shuffled = members.random(members.size);
	const content = shuffled.map((m: GuildMember, i) => `${i + 1}. ${m.toString()}`).join("\n");

	await interaction.editReply(content);
}
