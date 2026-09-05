import { describe, expect, it } from "vitest";
import { loadConfig, parseIgnoreRoleIds, validateConfig } from "./config";

describe("parseIgnoreRoleIds", () => {
	it("未設定の場合は空配列を返す", () => {
		expect(parseIgnoreRoleIds(undefined)).toEqual([]);
		expect(parseIgnoreRoleIds("")).toEqual([]);
	});

	it("カンマ区切りの各項目からIDを取り出す", () => {
		expect(parseIgnoreRoleIds("111:管理者,222:モデレーター")).toEqual(["111", "222"]);
	});

	it("説明のない項目はそのままIDになる", () => {
		expect(parseIgnoreRoleIds("123456789")).toEqual(["123456789"]);
	});

	it("IDの前後の空白を除去する", () => {
		expect(parseIgnoreRoleIds(" 123 :ノート")).toEqual(["123"]);
	});

	it("IDが空の項目は除外する", () => {
		expect(parseIgnoreRoleIds(":ノート,123:有効")).toEqual(["123"]);
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
