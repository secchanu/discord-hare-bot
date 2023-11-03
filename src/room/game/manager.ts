import { KeyvFile } from "keyv-file";
import type { Role, Snowflake } from "discord.js";

export type Game = {
	id: Snowflake | null;
	name: string;
	data: {
		[key: string]: string[];
	};
};

export const defaultGame: Game = {
	id: "",
	name: "Free",
	data: {},
};

export const gameMap = new KeyvFile<Game>({ filename: "games.keyv" });

export const createGame = (role: Role) => {
	const game: Game = { id: role.id, name: role.name, data: {} };
	gameMap.set(role.id, game);
	return game;
};

/**
 * Gameの削除
 * Events.GuildRoleDelete
 */
export const deleteGame = async (role: Role) => {
	if (!gameMap.has(role.id)) return;
	gameMap.delete(role.id);
};
