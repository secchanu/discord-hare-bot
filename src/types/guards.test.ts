import { GuildMemberRoleManager } from "discord.js";
import { describe, expect, it } from "vitest";
import { hasRoleManager } from "./guards";

describe("hasRoleManager", () => {
	it("rolesが GuildMemberRoleManager のインスタンスのとき true を返す", () => {
		const mockRoles = Object.create(GuildMemberRoleManager.prototype);
		const member = { roles: mockRoles };
		expect(hasRoleManager(member as never)).toBe(true);
	});

	it("rolesが配列（APIGuildMember）のとき false を返す", () => {
		const member = { roles: ["role-id-1", "role-id-2"] };
		expect(hasRoleManager(member as never)).toBe(false);
	});

	it("rolesプロパティが存在しないとき false を返す", () => {
		const member = { voice: {} };
		expect(hasRoleManager(member as never)).toBe(false);
	});
});
