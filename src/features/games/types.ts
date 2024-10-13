import type { Snowflake } from "discord.js";

/**
 * ゲームデータ
 */
export interface Game {
	id: Snowflake; // Role ID
	name: string;
	data: {
		[key: string]: string[];
	};
}

/**
 * デフォルトゲーム
 */
export const defaultGame: Game = {
	id: "",
	name: "Free",
	data: {},
} as const;
