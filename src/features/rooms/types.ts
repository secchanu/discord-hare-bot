import type { Snowflake } from "discord.js";
import type { Game } from "../games/types";
import type { Room } from "./Room";

/**
 * 永続化するルームのデータ
 * createdAt は JSON シリアライズで型が保てないため ISO 文字列で保持する
 */
export interface RoomData {
	id: Snowflake; // カテゴリーのID
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
 * ルームの作成オプション
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
	 * ルームの状態を永続化する
	 * Room の状態を変更するメソッドが、変更のたびに呼ぶ
	 */
	persist: (room: Room) => Promise<void>;
}
