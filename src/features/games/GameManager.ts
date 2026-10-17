import type { Role, Snowflake } from "discord.js";
import type { GameStore } from "./GameStore";
import { defaultGame, type Game } from "./types";

/**
 * ロールをゲームとして扱い、ゲームとそのデータを管理する
 */
export class GameManager {
	constructor(private store: GameStore) {}

	/**
	 * デフォルトゲームを返す
	 */
	getDefaultGame(): Game {
		return defaultGame;
	}

	/**
	 * 保存されているゲームを返す
	 */
	getGame(roleId: Snowflake): Game | null {
		if (!roleId) return this.getDefaultGame();

		return this.store.get(roleId) ?? null;
	}

	/**
	 * ロールからゲームを作成して保存する
	 */
	createGame(role: Role): Game {
		const game: Game = {
			id: role.id,
			name: role.name,
			data: {},
		};

		this.store.set(role.id, game);
		return game;
	}

	/**
	 * ゲームのデータを更新する（項目が空なら削除する）
	 */
	updateGameData(roleId: Snowflake, key: string, data: string[] | null): void {
		const game = this.store.get(roleId);
		if (!game) return;

		if (!data || data.length === 0) {
			delete game.data[key];
		} else {
			game.data[key] = data;
		}

		this.store.set(roleId, game);
	}
}
