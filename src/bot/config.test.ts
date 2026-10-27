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

	it("Claude API のキーがある場合は、ゲームの質問に答える機能を使う", () => {
		const config = loadConfig({ ...env, ANTHROPIC_API_KEY: "key" });

		expect(config.assistant?.anthropicApiKey).toBe("key");
	});

	it("質問に答えるモデルは環境変数で切り替えられる", () => {
		const config = loadConfig({
			...env,
			ANTHROPIC_API_KEY: "key",
			ASSISTANT_MODEL: "claude-sonnet-5-5",
		});

		expect(config.assistant?.model).toBe("claude-sonnet-5-5");
	});

	it("MCP サーバーの URL は環境変数で渡す", () => {
		const config = loadConfig({
			...env,
			ANTHROPIC_API_KEY: "key",
			ASSISTANT_MCP_URL: "https://example.com/mcp",
		});

		expect(config.assistant?.mcpUrl).toBe("https://example.com/mcp");
	});

	it("Claude API のキーが未設定の場合は、ゲームの質問に答える機能を使わない", () => {
		expect(loadConfig(env).assistant).toBeUndefined();
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
