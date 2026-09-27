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
} as const;

// Discord の制限
export const DISCORD_LIMITS = {
	MAX_SELECT_MENU_OPTIONS: 25,
	MAX_ADDITIONAL_VOICE_CHANNELS: 25,
} as const;

// タイムアウト
export const TIMEOUT = {
	// ルーム作成時に初期ゲームの判定に使う募集メッセージの有効期限
	GAME_WANTED_MESSAGE: 6 * TIME.HOUR,
	// ボタン・セレクトメニュー・モーダルを使うセッションの無操作タイムアウト
	// 残るのは実行者だけが操作できるUIのため、一度に遊ぶ時間を十分に超える長さにする
	// コマンドのインタラクショントークンの有効期限（15分）を超えるため、セッション中のメッセージ編集は、セッションで受け取ったインタラクションかメッセージの編集で行う
	COMPONENT_IDLE: 12 * TIME.HOUR,
	// コレクターのないコンポーネント操作に期限切れを返すまでの猶予
	// 動作中のコレクターが先に応答するのを待ち、最初の応答の期限（3秒）内に収める
	ORPHANED_COMPONENT_GRACE: 2 * TIME.SECOND,
} as const;
