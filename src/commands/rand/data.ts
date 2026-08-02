import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	ComponentType,
	StringSelectMenuBuilder,
} from "discord.js";
import type { AppContext } from "../../bot/context";
import { TIMEOUT } from "../../constants";
import { getRoomFromTextChannel } from "../helpers/room";

/**
 * /rand data サブコマンド
 * ゲームデータからランダム選択
 */
export async function handleData(
	interaction: ChatInputCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	await interaction.deferReply();

	const room = getRoomFromTextChannel(interaction, ctx.roomManager);
	if (!room) {
		await interaction.editReply("このコマンドはルーム内でのみ使用できます。");
		return;
	}

	// ルームのゲームはメモリ上のスナップショットのため、最新のデータをストアから取得する
	const game = await ctx.gameManager.getGame(room.game.id);

	if (!game) {
		await interaction.editReply("ルームにゲームが設定されていません。");
		return;
	}

	const gameData = game.data;
	if (!Object.keys(gameData).length) {
		await interaction.editReply(
			`抽選できるデータがありません\n部屋のゲームを確認してください\n現在のゲームは「${game.name}」です`,
		);
		return;
	}

	// データ選択メニュー
	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId("data_key")
		.setPlaceholder("データを選択")
		.addOptions(
			Object.keys(gameData).map((key) => ({
				label: key,
				value: key,
			})),
		);

	const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

	const message = await interaction.editReply({
		content: "抽選するデータを選択してください",
		components: [selectRow],
	});

	// データ選択を待つ
	const selectInteraction = await message
		.awaitMessageComponent({
			componentType: ComponentType.StringSelect,
			filter: (i) => i.user.id === interaction.user.id,
			time: TIMEOUT.INTERACTION,
		})
		.catch(() => null);

	if (!selectInteraction) {
		await interaction.editReply({
			content: "タイムアウトしました",
			components: [],
		});
		return;
	}

	await selectInteraction.deferUpdate();

	const dataKey = selectInteraction.values[0];
	const items = gameData[dataKey];

	if (!items || items.length === 0) {
		await interaction.editReply({
			content: "データが空です",
			components: [],
		});
		return;
	}

	// ランダム選択関数
	const getRandom = () => items[Math.floor(Math.random() * items.length)];

	// アクションボタン
	const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("cancel").setLabel("キャンセル").setStyle(ButtonStyle.Danger),
		new ButtonBuilder().setCustomId("confirm").setLabel("確定").setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId("reroll").setLabel("再抽選").setStyle(ButtonStyle.Primary),
	);

	await selectInteraction.editReply({
		content: getRandom(),
		components: [actionRow],
	});

	// ボタン操作を処理（セッションUI: 無操作が続いたら終了する）
	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		idle: TIMEOUT.COMPONENT_IDLE,
		filter: (i) =>
			i.user.id === interaction.user.id && ["cancel", "confirm", "reroll"].includes(i.customId),
	});

	collector.on("collect", async (buttonInteraction) => {
		switch (buttonInteraction.customId) {
			case "cancel":
				collector.stop("cancel");
				await buttonInteraction.deferUpdate();
				await buttonInteraction.deleteReply();
				break;

			case "confirm":
				collector.stop("confirm");
				await buttonInteraction.update({ components: [] });
				break;

			case "reroll":
				await buttonInteraction.update({
					content: getRandom(),
					components: [actionRow],
				});
				break;
		}
	});

	// セッション終了時はボタンを取り除き、押せない死にボタンを残さない
	collector.on("end", async (_collected, reason) => {
		if (reason === "cancel" || reason === "confirm") return;
		try {
			await message.edit({ components: [] });
		} catch {
			// メッセージが削除済みの場合などは無視する
		}
	});
}
