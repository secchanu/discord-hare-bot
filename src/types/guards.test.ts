import { GuildMemberRoleManager } from "discord.js";
import { describe, expect, it } from "vitest";
import { hasRoleManager, hasVoiceState } from "./guards";

describe("hasRoleManager", () => {
	it("rolesが GuildMemberRoleManager のインスタンスのとき true を返す", () => {
		const mockRoles = Object.create(GuildMemberRoleManager.prototype);
		const member = { roles: mockRoles };
		expect(hasRoleManager(member as never)).toBe(true);
	});

	it("rolesが配列（APIGuildMember）のとき false を返す", () => {
		// APIGuildMember は roles を string[] として持つ
		const member = { roles: ["role-id-1", "role-id-2"] };
		expect(hasRoleManager(member as never)).toBe(false);
	});

	it("rolesプロパティが存在しないとき false を返す", () => {
		const member = { voice: {} };
		expect(hasRoleManager(member as never)).toBe(false);
	});
});

describe("hasVoiceState", () => {
	it("voiceがオブジェクトのとき true を返す", () => {
		const member = { voice: { channel: null } };
		expect(hasVoiceState(member as never)).toBe(true);
	});

	it("voiceプロパティが存在しないとき false を返す", () => {
		const member = { roles: [] };
		expect(hasVoiceState(member as never)).toBe(false);
	});

	it("voiceが文字列のとき false を返す", () => {
		const member = { voice: "invalid" };
		expect(hasVoiceState(member as never)).toBe(false);
	});

	it("voiceがnullのとき true を返す（typeof null === 'object' の仕様により）", () => {
		// JS の仕様上 typeof null === "object" が true のため、実装上 null でも true になる
		const member = { voice: null };
		expect(hasVoiceState(member as never)).toBe(true);
	});
});
