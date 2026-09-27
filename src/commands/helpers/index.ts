import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type Message,
	type MessageComponentInteraction,
	MessageFlags,
	type ModalSubmitInteraction,
	type RepliableInteraction,
} from "discord.js";

// 複数のコマンドで共通の応答メッセージ
export const ROOM_ONLY_MESSAGE = "このコマンドはルーム内でのみ使用できます";
export const TIMEOUT_MESSAGE = "タイムアウトしました";
export const MOVE_FAILED_MESSAGE = "移動できなかったメンバーがいます";

/**
 * 失敗を実行者にだけ通知する
 * エフェメラルかどうかは最初の応答で決まるため、応答済みなら全員に見える応答を取り下げてからエフェメラルで送り直す
 */
export async function replyError(
	interaction: RepliableInteraction,
	content: string,
): Promise<void> {
	if (!interaction.deferred && !interaction.replied) {
		await interaction.reply({ content, flags: MessageFlags.Ephemeral });
		return;
	}
	await interaction.deleteReply();
	await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
}

/**
 * コンポーネント操作とモーダル送信をコマンドの実行者に限定する、コレクターのフィルターを作る
 * 実行者以外の操作には、その場でエフェメラルで応答する
 */
export function createCommandUserFilter(userId: string) {
	return async (
		componentInteraction: MessageComponentInteraction | ModalSubmitInteraction,
	): Promise<boolean> => {
		if (componentInteraction.user.id === userId) return true;
		try {
			await componentInteraction.reply({
				content: "この操作はコマンドを実行した人のみ行えます",
				flags: MessageFlags.Ephemeral,
			});
		} catch {
			// 応答の失敗は無視する
		}
		return false;
	};
}

/**
 * 抽選結果を操作するボタン（キャンセル・確定・再抽選）の行を作る
 */
export function createDrawButtonRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("cancel").setLabel("キャンセル").setStyle(ButtonStyle.Danger),
		new ButtonBuilder().setCustomId("confirm").setLabel("確定").setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId("reroll").setLabel("再抽選").setStyle(ButtonStyle.Primary),
	);
}

/**
 * セッションの終了時に、応答しなくなったコンポーネントをメッセージから取り除く
 */
export async function clearComponents(
	message: Pick<Message, "edit">,
	content?: string,
): Promise<void> {
	try {
		await message.edit(content === undefined ? { components: [] } : { content, components: [] });
	} catch {
		// 編集の失敗は無視する
	}
}
