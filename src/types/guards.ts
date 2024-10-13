import {
	type APIGuildMember,
	type GuildMember,
	GuildMemberRoleManager,
} from "discord.js";

/**
 * Type guards for Discord.js types
 */

/**
 * Check if member has role manager (not API member)
 */
export function hasRoleManager(
	member: GuildMember | APIGuildMember,
): member is GuildMember {
	return "roles" in member && member.roles instanceof GuildMemberRoleManager;
}

/**
 * Check if member has voice state
 */
export function hasVoiceState(
	member: GuildMember | APIGuildMember,
): member is GuildMember {
	return "voice" in member && typeof member.voice === "object";
}
