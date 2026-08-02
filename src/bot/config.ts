/**
 * Bot設定
 * 環境変数から読み込み、composition root（index.ts）で検証して注入する
 */

interface IgnoreRole {
	id: string;
	note: string;
}

interface BotConfig {
	botToken: string;
	guildId: string;
	readyChannelId: string;
	wantedChannelId: string;
	ignoreRoleIds: string[];
	ignoreRoles: IgnoreRole[];
}

/**
 * 環境変数からignoreRolesをパース
 */
export function parseIgnoreRoles(envValue: string | undefined): IgnoreRole[] {
	if (!envValue) return [];

	return envValue
		.split(",")
		.map((item) => {
			const colonIndex = item.indexOf(":");
			let id: string;
			let note: string;

			if (colonIndex === -1) {
				// コロンがない場合
				id = item.trim();
				note = "";
			} else {
				// コロンがある場合、最初のコロンで分割
				id = item.substring(0, colonIndex).trim();
				note = item.substring(colonIndex + 1).trim();
			}

			return { id, note };
		})
		.filter((role) => role.id); // 空のIDは除外
}

/**
 * 環境変数から設定を読み込み
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
	const ignoreRoles = parseIgnoreRoles(env.DISCORD_IGNORE_ROLES);

	return {
		botToken: env.DISCORD_BOT_TOKEN || "",
		guildId: env.DISCORD_GUILD_ID || "",
		readyChannelId: env.DISCORD_READY_CHANNEL_ID || "",
		wantedChannelId: env.DISCORD_WANTED_CHANNEL_ID || "",
		ignoreRoleIds: ignoreRoles.map((role) => role.id),
		ignoreRoles: ignoreRoles,
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

export type { BotConfig, IgnoreRole };
