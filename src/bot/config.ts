/**
 * Bot設定
 * 環境変数から読み込み、デフォルト値で補完
 */

import { EXIT_CODE } from "../constants";

interface IgnoreRole {
	id: string;
	note: string;
}

interface BotConfig {
	botToken: string;
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
function loadConfig(): BotConfig {
	const ignoreRoles = parseIgnoreRoles(process.env.DISCORD_IGNORE_ROLES);

	return {
		botToken: process.env.DISCORD_BOT_TOKEN || "",
		readyChannelId: process.env.DISCORD_READY_CHANNEL_ID || "",
		wantedChannelId: process.env.DISCORD_WANTED_CHANNEL_ID || "",
		ignoreRoleIds: ignoreRoles.map((role) => role.id),
		ignoreRoles: ignoreRoles,
	};
}

/**
 * 設定の検証
 */
export function validateConfig(config: BotConfig): void {
	const errors: string[] = [];

	if (!config.botToken) {
		errors.push("DISCORD_BOT_TOKEN is required");
	}

	if (!config.readyChannelId) {
		errors.push("DISCORD_READY_CHANNEL_ID is required");
	}

	if (!config.wantedChannelId) {
		errors.push("DISCORD_WANTED_CHANNEL_ID is required");
	}

	if (errors.length > 0) {
		console.error("Configuration errors:");
		for (const error of errors) {
			console.error(`  - ${error}`);
		}
		console.error("\nPlease check your environment variables or .env file");
		process.exit(EXIT_CODE.ERROR);
	}
}

// 設定を読み込んで検証
let config: BotConfig;

// テスト環境では初期化をスキップ
if (process.env.NODE_ENV !== "test") {
	config = loadConfig();
	validateConfig(config);
} else {
	// テスト用のダミー設定
	config = {
		botToken: "",
		readyChannelId: "",
		wantedChannelId: "",
		ignoreRoleIds: [],
		ignoreRoles: [],
	};
}

export { config, type BotConfig };
