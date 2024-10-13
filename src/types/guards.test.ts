import {
	type APIGuildMember,
	type GuildMember,
	GuildMemberFlags,
	GuildMemberRoleManager,
	type VoiceState,
} from "discord.js";
import { describe, expect, it } from "vitest";
import { hasRoleManager, hasVoiceState } from "./guards";

describe("guards", () => {
	describe("hasRoleManager", () => {
		it("GuildMemberRoleManagerを持つ場合はtrueを返す", () => {
			const mockRoleManager = Object.create(GuildMemberRoleManager.prototype);
			const guildMember = {
				roles: mockRoleManager,
			} as GuildMember;

			const result = hasRoleManager(guildMember);

			expect(result).toBe(true);
		});

		it("rolesプロパティがGuildMemberRoleManagerでない場合はfalseを返す", () => {
			const guildMember = {
				roles: { cache: new Map() }, // GuildMemberRoleManagerではない
			} as unknown as GuildMember;

			const result = hasRoleManager(guildMember);

			expect(result).toBe(false);
		});

		it("APIGuildMemberの場合はfalseを返す", () => {
			const apiMember: APIGuildMember = {
				user: {
					id: "123",
					username: "test",
					discriminator: "0000",
					avatar: null,
					global_name: null,
				},
				roles: ["456", "789"], // 文字列の配列
				joined_at: "2023-01-01T00:00:00Z",
				deaf: false,
				mute: false,
				flags: GuildMemberFlags.DidRejoin,
			};

			const result = hasRoleManager(apiMember);

			expect(result).toBe(false);
		});

		it("rolesプロパティがない場合はfalseを返す", () => {
			const invalidMember = {
				id: "123",
				// rolesプロパティなし
			} as unknown as GuildMember;

			const result = hasRoleManager(invalidMember);

			expect(result).toBe(false);
		});
	});

	describe("hasVoiceState", () => {
		it("voiceプロパティがオブジェクトの場合はtrueを返す", () => {
			const guildMember = {
				voice: {
					channel: null,
					deaf: false,
					mute: false,
				} as VoiceState,
			} as GuildMember;

			const result = hasVoiceState(guildMember);

			expect(result).toBe(true);
		});

		it("voiceプロパティが存在しない場合はfalseを返す", () => {
			const apiMember: APIGuildMember = {
				user: {
					id: "123",
					username: "test",
					discriminator: "0000",
					avatar: null,
					global_name: null,
				},
				roles: ["456"],
				joined_at: "2023-01-01T00:00:00Z",
				deaf: false,
				mute: false,
				flags: GuildMemberFlags.DidRejoin,
				// voiceプロパティなし
			};

			const result = hasVoiceState(apiMember);

			expect(result).toBe(false);
		});

		it("voiceプロパティがnullの場合はtrueを返す（オブジェクトとして判定）", () => {
			const guildMember = {
				voice: null,
			} as unknown as GuildMember;

			const result = hasVoiceState(guildMember);

			// typeof null === "object" なので true になる
			expect(result).toBe(true);
		});

		it("voiceプロパティが文字列などオブジェクト以外の場合はfalseを返す", () => {
			const invalidMember = {
				voice: "not an object",
			} as unknown as GuildMember;

			const result = hasVoiceState(invalidMember);

			expect(result).toBe(false);
		});

		it("voiceプロパティがundefinedの場合はfalseを返す", () => {
			const guildMember = {
				voice: undefined,
			} as unknown as GuildMember;

			const result = hasVoiceState(guildMember);

			expect(result).toBe(false);
		});
	});

	describe("型ガードとしての動作確認", () => {
		it("hasRoleManagerがtrueの場合、TypeScriptの型推論が正しく動作する", () => {
			// GuildMemberRoleManagerのモックを作成
			const mockRoleManager = Object.create(GuildMemberRoleManager.prototype);
			// cacheプロパティのゲッターを定義
			Object.defineProperty(mockRoleManager, "cache", {
				get() {
					return new Map();
				},
				configurable: true,
			});

			const member: GuildMember | APIGuildMember = {
				roles: mockRoleManager,
				voice: {} as VoiceState,
			} as GuildMember;

			if (hasRoleManager(member)) {
				// ここでmemberはGuildMemberとして推論される
				// roles.cacheにアクセスできることを確認
				expect(member.roles.cache).toBeDefined();
				expect(member.roles.cache).toBeInstanceOf(Map);
			}
		});

		it("hasVoiceStateがtrueの場合、TypeScriptの型推論が正しく動作する", () => {
			const member: GuildMember | APIGuildMember = {
				voice: {
					channel: null,
					deaf: false,
					mute: false,
				} as VoiceState,
			} as GuildMember;

			if (hasVoiceState(member)) {
				// ここでmemberはGuildMemberとして推論される
				// voice.channelにアクセスできることを確認
				expect(member.voice).toBeDefined();
			}
		});
	});
});
