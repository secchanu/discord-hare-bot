import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { isGuildInteraction } from "../helpers";

/**
 * /rand member サブコマンド
 * VCメンバーからランダム選択
 */
export async function handleMember(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	if (!isGuildInteraction(interaction)) {
		await interaction.editReply("このコマンドはサーバー内でのみ使用できます。");
		return;
	}

	const channel = interaction.member.voice.channel;
	if (!channel) {
		await interaction.editReply("VCに接続していません");
		return;
	}

	const number = interaction.options.getInteger("number") ?? 1;
	const members = channel.members.filter((m: GuildMember) => !m.user.bot);

	if (members.size === 0) {
		await interaction.editReply("選択可能なメンバーがいません");
		return;
	}

	const selected = members.random(Math.min(number, members.size));
	const content = selected.map((m: GuildMember) => m.toString()).join("\n");

	await interaction.editReply(content);
}
