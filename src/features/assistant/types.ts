import type Anthropic from "@anthropic-ai/sdk";
import type { Snowflake } from "discord.js";

/**
 * ルームでの Bot との会話
 * Claude API とやり取りしたメッセージを、やり取りした順に持つ
 * Claude の応答は、受け取ったときのまま持つ
 */
export interface Conversation {
	// 会話で Claude に最後に伝えたゲームのID
	// まだ伝えていないときは null
	gameId: Snowflake | null;
	messages: Anthropic.Beta.Messages.BetaMessageParam[];
}
