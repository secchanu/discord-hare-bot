import type { Snowflake } from "discord.js";

/**
 * 永続化可能なルームデータ
 */
export interface RoomData {
	id: Snowflake; // categoryId
	guildId: Snowflake;
	hostname: string;
	ownerId?: Snowflake;
	gameId: Snowflake;
	reserved: boolean;
	createdAt: Date;
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
	position?: number;
	reserved?: boolean;
	eventId?: Snowflake;
}
