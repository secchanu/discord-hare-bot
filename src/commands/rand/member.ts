import type { GuildMember } from "discord.js";
import type { AppContext } from "../../bot/context";
import { ROOM_ONLY_MESSAGE, replyError } from "../helpers";
import { getRoomFromVoiceAndTextChannel } from "../helpers/room";
import type { GuildCommandInteraction } from "../types";

/**
 * /rand member サブコマンド
 * ボイスチャンネルのメンバーからランダムに選ぶ
 */
export async function handleMember(
	interaction: GuildCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	const room = getRoomFromVoiceAndTextChannel(interaction, ctx.roomManager);
	const channel = interaction.member.voice.channel;
	if (!room || !channel) {
		await replyError(interaction, ROOM_ONLY_MESSAGE);
		return;
	}

	const number = interaction.options.getInteger("number") ?? 1;
	// 実行者自身がボイスチャンネルにいるため、候補は1人以上いる
	const members = channel.members.filter((m: GuildMember) => !m.user.bot);

	await interaction.deferReply();

	const selected = members.random(Math.min(number, members.size));
	const content = selected.map((m: GuildMember) => m.toString()).join("\n");

	await interaction.editReply(content);
}
