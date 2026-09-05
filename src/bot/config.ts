/**
 * Bot設定
 * 環境変数から読み込み、composition root（index.ts）で検証して注入する
 */

interface BotConfig {
	botToken: string;
	guildId: string;
	readyChannelId: string;
	wantedChannelId: string;
	ignoreRoleIds: string[];
}

/**
 * 環境変数から除外ロールIDをパース
 * 形式は "id:説明,id:説明,..." で、説明は人が読むためのもののため読み捨てる
 */
export function parseIgnoreRoleIds(envValue: string | undefined): string[] {
	if (!envValue) return [];

	return envValue
		.split(",")
		.map((item) => item.split(":")[0].trim())
		.filter((id) => id);
}

/**
 * 環境変数から設定を読み込み
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
	return {
		botToken: env.DISCORD_BOT_TOKEN || "",
		guildId: env.DISCORD_GUILD_ID || "",
		readyChannelId: env.DISCORD_READY_CHANNEL_ID || "",
		wantedChannelId: env.DISCORD_WANTED_CHANNEL_ID || "",
		ignoreRoleIds: parseIgnoreRoleIds(env.DISCORD_IGNORE_ROLES),
	};
}

/**
 * 設定の検証
 * 不足している環境変数のエラーメッセージ一覧を返す
 */
export function validateConfig(config: BotConfig): string[] {
	const errors: string[] = [];

	if (!config.botToken) {
		errors.push("DISCORD_BOT_TOKEN is required");
	}

	if (!config.guildId) {
		errors.push("DISCORD_GUILD_ID is required");
	}

	if (!config.readyChannelId) {
		errors.push("DISCORD_READY_CHANNEL_ID is required");
	}

	if (!config.wantedChannelId) {
		errors.push("DISCORD_WANTED_CHANNEL_ID is required");
	}

	return errors;
}

export type { BotConfig };
