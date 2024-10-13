import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	ComponentType,
	StringSelectMenuBuilder,
} from "discord.js";
import { TIMEOUT } from "../../constants";
import { GameManager } from "../../features/games/GameManager";
import { getRoomFromTextChannel } from "../helpers/room";

/**
 * /rand data サブコマンド
 * ゲームデータからランダム選択
 */
export async function handleData(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const room = getRoomFromTextChannel(interaction);
	if (!room) {
		await interaction.editReply("このコマンドはルーム内でのみ使用できます。");
		return;
	}

	const roomData = room.toData();
	const gameManager = GameManager.getInstance();
	const game = await gameManager.getGame(roomData.gameId);

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

	const selectRow =
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

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
		new ButtonBuilder()
			.setCustomId("cancel")
			.setLabel("キャンセル")
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setCustomId("confirm")
			.setLabel("確定")
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId("reroll")
			.setLabel("再抽選")
			.setStyle(ButtonStyle.Primary),
	);

	await selectInteraction.editReply({
		content: getRandom(),
		components: [actionRow],
	});

	// ボタン操作を処理
	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		filter: (i) =>
			i.user.id === interaction.user.id &&
			["cancel", "confirm", "reroll"].includes(i.customId),
	});

	collector.on("collect", async (buttonInteraction) => {
		switch (buttonInteraction.customId) {
			case "cancel":
				collector.stop();
				await buttonInteraction.deferUpdate();
				await interaction.deleteReply();
				break;

			case "confirm":
				collector.stop();
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
}
