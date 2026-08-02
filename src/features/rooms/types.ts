import type { Snowflake } from "discord.js";
import type { Game } from "../games/types";
import type { Room } from "./Room";

/**
 * 永続化可能なルームデータ
 * createdAt は JSON シリアライズで型が保てないため ISO 文字列で保持する
 */
export interface RoomData {
	id: Snowflake; // categoryId
	guildId: Snowflake;
	hostname: string;
	ownerId?: Snowflake;
	gameId: Snowflake;
	reserved: boolean;
	createdAt: string;
	channels: {
		categoryId: Snowflake;
		textChannelId: Snowflake;
		voiceChannelId: Snowflake;
		additionalVoiceChannelIds: Snowflake[];
	};
	eventId?: Snowflake;
}

/**
 * ルーム作成オプション
 */
export interface CreateRoomOptions {
	hostname: string;
	ownerId?: Snowflake;
	reserved?: boolean;
	eventId?: Snowflake;
	game?: Game;
}

/**
 * Room から外部へ委譲する処理
 */
export interface RoomHooks {
	/**
	 * ルームの状態変更を永続化する
	 * Room の各 mutation メソッドが変更後に必ず呼ぶため、呼び出し側での保存は不要
	 */
	persist: (room: Room) => Promise<void>;
}
