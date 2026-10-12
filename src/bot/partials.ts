import { Partials } from "discord.js";

/**
 * キャッシュにない構造体でもイベントを受け取るためのパーシャル
 * 参加登録のイベントは、ユーザーをIDだけで表す
 * User があれば、キャッシュにないユーザーの参加登録のイベントも受け取れる
 */
export const partials = [Partials.User] as const;
