import type {
	ChatInputCommandInteraction,
	GuildMember,
	GuildTextBasedChannel,
} from "discord.js";

/**
 * コマンドヘルパー関数
 */

/**
 * インタラクションがギルド内で実行されているか確認
 */
export function isGuildInteraction(
	interaction: ChatInputCommandInteraction,
): interaction is ChatInputCommandInteraction<"cached"> & {
	member: GuildMember;
	channel: GuildTextBasedChannel;
} {
	return interaction.inCachedGuild() && interaction.channel !== null;
}

/**
 * チャンネルがカテゴリに属しているか確認
 */
export function hasParentId(channel: unknown): channel is { parentId: string } {
	return (
		typeof channel === "object" &&
		channel !== null &&
		"parentId" in channel &&
		typeof channel.parentId === "string"
	);
}
