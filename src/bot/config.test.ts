import { describe, expect, it } from "vitest";
import { loadConfig, parseIgnoreRoles, validateConfig } from "./config";

describe("parseIgnoreRoles", () => {
	it("undefinedを渡した場合は空配列を返す", () => {
		expect(parseIgnoreRoles(undefined)).toEqual([]);
	});

	it("空文字列を渡した場合は空配列を返す", () => {
		expect(parseIgnoreRoles("")).toEqual([]);
	});

	it("単一の id:note 形式をパースする", () => {
		expect(parseIgnoreRoles("123456789:モデレーター")).toEqual([
			{ id: "123456789", note: "モデレーター" },
		]);
	});

	it("複数の id:note 形式をカンマ区切りでパースする", () => {
		expect(parseIgnoreRoles("111:管理者,222:モデレーター")).toEqual([
			{ id: "111", note: "管理者" },
			{ id: "222", note: "モデレーター" },
		]);
	});

	it("コロンがない場合はnoteが空文字になる", () => {
		expect(parseIgnoreRoles("123456789")).toEqual([{ id: "123456789", note: "" }]);
	});

	it("id の前後の空白を除去する", () => {
		expect(parseIgnoreRoles(" 123 :ノート")).toEqual([{ id: "123", note: "ノート" }]);
	});

	it("note の前後の空白を除去する", () => {
		expect(parseIgnoreRoles("123: ノート ")).toEqual([{ id: "123", note: "ノート" }]);
	});

	it("IDが空の項目は除外される", () => {
		expect(parseIgnoreRoles(":ノート,123:有効")).toEqual([{ id: "123", note: "有効" }]);
	});

	it("noteにコロンが含まれる場合、最初のコロンで分割される", () => {
		expect(parseIgnoreRoles("123:ノート:追記")).toEqual([{ id: "123", note: "ノート:追記" }]);
	});
});

describe("loadConfig", () => {
	it("環境変数から設定を読み込む", () => {
		const config = loadConfig({
			DISCORD_BOT_TOKEN: "token",
			DISCORD_GUILD_ID: "guild-1",
			DISCORD_READY_CHANNEL_ID: "111",
			DISCORD_WANTED_CHANNEL_ID: "222",
			DISCORD_IGNORE_ROLES: "333:管理者",
		});

		expect(config).toEqual({
			botToken: "token",
			guildId: "guild-1",
			readyChannelId: "111",
			wantedChannelId: "222",
			ignoreRoleIds: ["333"],
			ignoreRoles: [{ id: "333", note: "管理者" }],
		});
	});

	it("未設定の環境変数は空値になる", () => {
		const config = loadConfig({});

		expect(config).toEqual({
			botToken: "",
			guildId: "",
			readyChannelId: "",
			wantedChannelId: "",
			ignoreRoleIds: [],
			ignoreRoles: [],
		});
	});
});

describe("validateConfig", () => {
	const validConfig = {
		botToken: "token",
		guildId: "guild-1",
		readyChannelId: "111",
		wantedChannelId: "222",
		ignoreRoleIds: [],
		ignoreRoles: [],
	};

	it("全必須フィールドが揃っている場合はエラーなし", () => {
		expect(validateConfig(validConfig)).toEqual([]);
	});

	it("botTokenが空の場合はエラーが返る", () => {
		const errors = validateConfig({ ...validConfig, botToken: "" });
		expect(errors).toEqual(["DISCORD_BOT_TOKEN is required"]);
	});

	it("guildIdが空の場合はエラーが返る", () => {
		const errors = validateConfig({ ...validConfig, guildId: "" });
		expect(errors).toEqual(["DISCORD_GUILD_ID is required"]);
	});

	it("readyChannelIdが空の場合はエラーが返る", () => {
		const errors = validateConfig({ ...validConfig, readyChannelId: "" });
		expect(errors).toEqual(["DISCORD_READY_CHANNEL_ID is required"]);
	});

	it("wantedChannelIdが空の場合はエラーが返る", () => {
		const errors = validateConfig({ ...validConfig, wantedChannelId: "" });
		expect(errors).toEqual(["DISCORD_WANTED_CHANNEL_ID is required"]);
	});

	it("複数フィールドが空の場合は全てのエラーが返る", () => {
		const errors = validateConfig({
			...validConfig,
			botToken: "",
			guildId: "",
			readyChannelId: "",
			wantedChannelId: "",
		});
		expect(errors).toHaveLength(4);
	});
});
