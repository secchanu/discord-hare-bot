/**
 * アプリケーション全体で使用する定数
 */

// 終了コード
export const EXIT_CODE = {
	SUCCESS: 0,
	ERROR: 1,
} as const;

// 時間関連の定数（ミリ秒）
export const TIME = {
	SECOND: 1000,
	MINUTE: 60 * 1000,
	HOUR: 60 * 60 * 1000,
	SIX_HOURS: 6 * 60 * 60 * 1000,
} as const;

// Discord制限
export const DISCORD_LIMITS = {
	MAX_SELECT_MENU_OPTIONS: 25,
	MAX_ADDITIONAL_VOICE_CHANNELS: 25,
} as const;

// タイムアウト
export const TIMEOUT = {
	INTERACTION: TIME.MINUTE, // インタラクションのタイムアウト
	MODAL_SUBMIT: TIME.HOUR, // モーダル送信のタイムアウト
	GAME_WANTED_MESSAGE: TIME.SIX_HOURS, // ゲーム募集メッセージの有効期限
} as const;
