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
	// セッションUI（ボタン操作）の無操作タイムアウト。
	// 15分（インタラクショントークンの有効期限）を超えるため、
	// メッセージ編集はコンポーネント側のインタラクションで行うこと
	COMPONENT_IDLE: 15 * TIME.MINUTE,
	// コレクターを失ったコンポーネント操作に「期限切れ」を返すまでの猶予。
	// 生きているコレクターが先に応答するのを待つ（初回応答期限の3秒以内に収める）
	ORPHANED_COMPONENT_GRACE: 2 * TIME.SECOND,
} as const;
