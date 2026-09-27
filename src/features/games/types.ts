import type { Snowflake } from "discord.js";

/**
 * ゲーム
 */
export interface Game {
	id: Snowflake; // ゲームを表すロールのID
	name: string;
	data: {
		[key: string]: string[];
	};
}

/**
 * ゲームを指定していないルームのゲーム
 */
export const defaultGame: Game = {
	id: "",
	name: "Free",
	data: {},
} as const;
