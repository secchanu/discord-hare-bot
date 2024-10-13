import { Collection, type GuildMember, type Snowflake } from "discord.js";

/**
 * チーム構成
 */
export interface Team {
	id: number;
	name: string;
	members: Collection<Snowflake, GuildMember>;
}

/**
 * メンバーをランダムにチーム分け
 */
export function createRandomTeams(
	members: Collection<Snowflake, GuildMember>,
	teamCount: number,
): Team[] {
	const teams: Team[] = [];
	const shuffled = members.clone();
	const baseSize = Math.floor(members.size / teamCount);
	const remainder = members.size % teamCount;

	for (let i = 0; i < teamCount; i++) {
		const size = baseSize + (i < remainder ? 1 : 0);
		const teamMembers = shuffled.random(size);

		const team: Team = {
			id: i,
			name: `チーム${i + 1}`,
			members: new Collection<Snowflake, GuildMember>(),
		};

		// teamMembersの各メンバーをCollectionに追加
		for (const member of teamMembers) {
			team.members.set(member.id, member);
		}

		teams.push(team);
		shuffled.sweep((m) => teamMembers.some((tm) => tm.id === m.id));
	}

	return teams;
}

/**
 * チームをフォーマットして表示用文字列に変換
 */
export function formatTeams(teams: Team[]): string {
	return teams
		.map((team) => {
			const memberList = team.members.map((m) => m.toString()).join("\n");
			return `${team.name}\n${memberList}`;
		})
		.join("\n\n");
}

/**
 * メンバーをバランスよくチーム分け（将来的な実装用）
 * スキルレベルやロールを考慮したチーム分けなど
 */
export function createBalancedTeams(
	members: Collection<Snowflake, GuildMember>,
	teamCount: number,
	_options?: {
		balanceBy?: "roles" | "skill";
		skillLevels?: Map<Snowflake, number>;
	},
): Team[] {
	// 現在はランダム分けと同じ
	// 将来的にはロールやスキルレベルでバランスを取る
	return createRandomTeams(members, teamCount);
}
