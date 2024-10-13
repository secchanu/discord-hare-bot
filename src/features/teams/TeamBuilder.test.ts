import { Collection, type GuildMember } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
	createBalancedTeams,
	createRandomTeams,
	formatTeams,
	type Team,
} from "./TeamBuilder";

// モックGuildMemberを作成するヘルパー
function createMockMember(id: string, displayName: string): GuildMember {
	return {
		id,
		displayName,
		toString: () => `<@${id}>`,
	} as GuildMember;
}

// モックメンバーのCollectionを作成するヘルパー
function createMockMemberCollection(
	count: number,
): Collection<string, GuildMember> {
	const collection = new Collection<string, GuildMember>();
	for (let i = 1; i <= count; i++) {
		const id = i.toString();
		collection.set(id, createMockMember(id, `Member${i}`));
	}
	return collection;
}

describe("TeamBuilder", () => {
	describe("createRandomTeams", () => {
		it("指定されたチーム数に分割される", () => {
			const members = createMockMemberCollection(10);

			const teams = createRandomTeams(members, 2);

			expect(teams).toHaveLength(2);
			expect(teams[0].id).toBe(0);
			expect(teams[1].id).toBe(1);
			expect(teams[0].name).toBe("チーム1");
			expect(teams[1].name).toBe("チーム2");
		});

		it("全メンバーが必ず1つのチームに所属する", () => {
			const members = createMockMemberCollection(10);

			const teams = createRandomTeams(members, 3);

			const totalMembers = teams.reduce(
				(sum, team) => sum + team.members.size,
				0,
			);
			expect(totalMembers).toBe(10);
		});

		it("メンバーの重複がない", () => {
			const members = createMockMemberCollection(10);

			const teams = createRandomTeams(members, 3);

			const allMemberIds = new Set<string>();
			for (const team of teams) {
				for (const [id] of team.members) {
					expect(allMemberIds.has(id)).toBe(false);
					allMemberIds.add(id);
				}
			}
			expect(allMemberIds.size).toBe(10);
		});

		it("チーム間のメンバー数の差が1以下になる", () => {
			// 5人を2チームに分ける場合、3人と2人に分かれる
			const members = createMockMemberCollection(5);

			const teams = createRandomTeams(members, 2);

			const sizes = teams
				.map((team) => team.members.size)
				.sort((a, b) => b - a);
			expect(sizes[0] - sizes[1]).toBeLessThanOrEqual(1);
			expect(sizes[0]).toBe(3);
			expect(sizes[1]).toBe(2);
		});

		it("割り切れる場合は均等に分配される", () => {
			const members = createMockMemberCollection(6);

			const teams = createRandomTeams(members, 3);

			for (const team of teams) {
				expect(team.members.size).toBe(2);
			}
		});

		it("1チームの場合は全員が同じチームになる", () => {
			const members = createMockMemberCollection(5);

			const teams = createRandomTeams(members, 1);

			expect(teams).toHaveLength(1);
			expect(teams[0].members.size).toBe(5);
		});

		it("メンバー数より多いチーム数を指定してもエラーにならない", () => {
			const members = createMockMemberCollection(2);

			const teams = createRandomTeams(members, 5);

			expect(teams).toHaveLength(5);
			// 最初の2チームにメンバーが1人ずつ、残りは空
			const nonEmptyTeams = teams.filter((team) => team.members.size > 0);
			expect(nonEmptyTeams).toHaveLength(2);
		});
	});

	describe("formatTeams", () => {
		it("チーム情報を正しくフォーマットする", () => {
			const team1: Team = {
				id: 0,
				name: "チーム1",
				members: new Collection([
					["1", createMockMember("1", "Member1")],
					["2", createMockMember("2", "Member2")],
				]),
			};
			const team2: Team = {
				id: 1,
				name: "チーム2",
				members: new Collection([["3", createMockMember("3", "Member3")]]),
			};

			const result = formatTeams([team1, team2]);
			expect(result).toBe("チーム1\n<@1>\n<@2>\n\nチーム2\n<@3>");
		});

		it("空のチームも正しくフォーマットする", () => {
			const team: Team = {
				id: 0,
				name: "空チーム",
				members: new Collection(),
			};

			const result = formatTeams([team]);
			expect(result).toBe("空チーム\n");
		});
	});

	describe("createBalancedTeams", () => {
		it("現在はcreateRandomTeamsと同じ動作をする", () => {
			const members = createMockMemberCollection(6);

			// randomのモックを作成して同じ結果を返すようにする
			const mockRandom = vi.spyOn(Collection.prototype, "random");
			mockRandom.mockImplementation(function (
				this: Collection<string, GuildMember>,
				amount: number,
			) {
				const result = [];
				const available = Array.from(this.values());
				for (let i = 0; i < amount && i < available.length; i++) {
					result.push(available[i]);
				}
				return result;
			});

			const randomTeams = createRandomTeams(members.clone(), 2);
			const balancedTeams = createBalancedTeams(members.clone(), 2);

			expect(balancedTeams).toHaveLength(randomTeams.length);
			// チーム数とメンバー数の分布が同じことを確認
			const randomSizes = randomTeams.map((t) => t.members.size).sort();
			const balancedSizes = balancedTeams.map((t) => t.members.size).sort();
			expect(balancedSizes).toEqual(randomSizes);

			mockRandom.mockRestore();
		});

		it("オプションを渡してもエラーにならない", () => {
			const members = createMockMemberCollection(4);
			const skillLevels = new Map([
				["1", 10],
				["2", 20],
				["3", 15],
				["4", 25],
			]);

			const teams = createBalancedTeams(members, 2, {
				balanceBy: "skill",
				skillLevels,
			});

			expect(teams).toHaveLength(2);
			const totalMembers = teams.reduce(
				(sum, team) => sum + team.members.size,
				0,
			);
			expect(totalMembers).toBe(4);
		});
	});
});
