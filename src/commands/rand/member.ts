import { type ChatInputCommandInteraction, type GuildMember, MessageFlags } from "discord.js";
import { GUILD_ONLY_MESSAGE, isGuildInteraction } from "../helpers";

/**
 * /rand member サブコマンド
 * VCメンバーからランダム選択
 */
export async function handleMember(interaction: ChatInputCommandInteraction): Promise<void> {
	if (!isGuildInteraction(interaction)) {
		await interaction.reply({ content: GUILD_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
		return;
	}

	await interaction.deferReply();

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
