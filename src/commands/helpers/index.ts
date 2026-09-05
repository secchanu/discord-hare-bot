import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	type GuildMember,
	type GuildTextBasedChannel,
	type Message,
	type MessageComponentInteraction,
	MessageFlags,
} from "discord.js";

/**
 * コマンドヘルパー関数
 */

// 複数のコマンドで共通の応答メッセージ
export const GUILD_ONLY_MESSAGE = "このコマンドはサーバー内でのみ使用できます";
export const ROOM_ONLY_MESSAGE = "このコマンドはルーム内でのみ使用できます";
export const TIMEOUT_MESSAGE = "タイムアウトしました";

/**
 * インタラクションがギルド内で実行されているか確認
 */
export function isGuildInteraction(
	interaction: ChatInputCommandInteraction,
): interaction is ChatInputCommandInteraction<"cached"> & {
	member: GuildMember;
	channel: GuildTextBasedChannel;
} {
	return interaction.inCachedGuild() && interaction.channel !== null;
}

/**
 * コンポーネント操作をコマンド実行者に限定するコレクター用フィルター
 * 実行者以外の操作にはその場でエフェメラル返信する
 */
export function createCommandUserFilter(userId: string) {
	return async (componentInteraction: MessageComponentInteraction): Promise<boolean> => {
		if (componentInteraction.user.id === userId) return true;
		try {
			await componentInteraction.reply({
				content: "この操作はコマンドを実行した人のみ行えます",
				flags: MessageFlags.Ephemeral,
			});
		} catch {
			// 応答失敗は無視する
		}
		return false;
	};
}

/**
 * 抽選結果を操作するボタン行（キャンセル・確定・再抽選）
 */
export function createDrawButtonRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("cancel").setLabel("キャンセル").setStyle(ButtonStyle.Danger),
		new ButtonBuilder().setCustomId("confirm").setLabel("確定").setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId("reroll").setLabel("再抽選").setStyle(ButtonStyle.Primary),
	);
}

/**
 * セッション終了時にメッセージからコンポーネントを取り除く
 * 押せない死にコンポーネントを残さないための処理で、メッセージが削除済みの場合は何もしない
 */
export async function clearComponents(
	message: Pick<Message, "edit">,
	content?: string,
): Promise<void> {
	try {
		await message.edit(content === undefined ? { components: [] } : { content, components: [] });
	} catch {
		// メッセージが削除済みの場合などは無視する
	}
}
