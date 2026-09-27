import { describe, expect, it } from "vitest";
import { loadConfig, validateConfig } from "./config";

const env = {
	DISCORD_BOT_TOKEN: "token",
	DISCORD_GUILD_ID: "guild-1",
	DISCORD_READY_CHANNEL_ID: "111",
	DISCORD_WANTED_CHANNEL_ID: "222",
};

describe("設定の読み込み", () => {
	it("環境変数から設定を読み込む", () => {
		expect(loadConfig({ ...env, DISCORD_IGNORE_ROLES: "333:管理者" })).toEqual({
			botToken: "token",
			guildId: "guild-1",
			readyChannelId: "111",
			wantedChannelId: "222",
			ignoreRoleIds: ["333"],
		});
	});

	it("除外ロールは「ID:説明」をカンマで区切って並べ、説明の省略とIDの前後の空白を許す", () => {
		const config = loadConfig({ ...env, DISCORD_IGNORE_ROLES: " 111 :管理者,222, 333 " });

		expect(config.ignoreRoleIds).toEqual(["111", "222", "333"]);
	});

	it("IDが空の除外ロールの項目は読み捨てる", () => {
		const config = loadConfig({ ...env, DISCORD_IGNORE_ROLES: ":説明だけ,,111:管理者" });

		expect(config.ignoreRoleIds).toEqual(["111"]);
	});

	it("除外ロールが未設定の場合は、除外するロールはない", () => {
		expect(loadConfig(env).ignoreRoleIds).toEqual([]);
	});
});

describe("設定の検証", () => {
	it("必須の環境変数がそろっていればエラーはない", () => {
		expect(validateConfig(loadConfig(env))).toEqual([]);
	});

	it("未設定の必須の環境変数をすべてエラーとして返す", () => {
		expect(validateConfig(loadConfig({}))).toEqual([
			"DISCORD_BOT_TOKEN is required",
			"DISCORD_GUILD_ID is required",
			"DISCORD_READY_CHANNEL_ID is required",
			"DISCORD_WANTED_CHANNEL_ID is required",
		]);
	});
});
