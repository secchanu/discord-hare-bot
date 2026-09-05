import { type APIGuildMember, type GuildMember, GuildMemberRoleManager } from "discord.js";

/**
 * discord.js の型ガード
 */

/**
 * メンバーがロールマネージャーを持つ（APIGuildMember ではない）か確認
 */
export function hasRoleManager(member: GuildMember | APIGuildMember): member is GuildMember {
	return "roles" in member && member.roles instanceof GuildMemberRoleManager;
}
