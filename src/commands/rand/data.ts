import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	ComponentType,
	StringSelectMenuBuilder,
} from "discord.js";
import type { AppContext } from "../../bot/context";
import { TIMEOUT } from "../../constants";
import {
	clearComponents,
	createCommandUserFilter,
	createDrawButtonRow,
	ROOM_ONLY_MESSAGE,
	TIMEOUT_MESSAGE,
} from "../helpers";
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
		await interaction.editReply(ROOM_ONLY_MESSAGE);
		return;
	}

	// ルームのゲームはメモリ上のスナップショットのため、最新のデータをストアから取得する
	const game = await ctx.gameManager.getGame(room.game.id);

	if (!game) {
		await interaction.editReply("ルームにゲームが設定されていません");
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
	const isCommandUser = createCommandUserFilter(interaction.user.id);
	const selectInteraction = await message
		.awaitMessageComponent({
			componentType: ComponentType.StringSelect,
			filter: isCommandUser,
			time: TIMEOUT.INTERACTION,
		})
		.catch(() => null);

	if (!selectInteraction) {
		await clearComponents(message, TIMEOUT_MESSAGE);
		return;
	}

	await selectInteraction.deferUpdate();

	const dataKey = selectInteraction.values[0];
	const items = gameData[dataKey];

	if (!items || items.length === 0) {
		await selectInteraction.editReply({
			content: "データが空です",
			components: [],
		});
		return;
	}

	// ランダム選択関数
	const getRandom = () => items[Math.floor(Math.random() * items.length)];

	const actionRow = createDrawButtonRow();

	await selectInteraction.editReply({
		content: getRandom(),
		components: [actionRow],
	});

	// セッションUI: 無操作が続いたら終了する。
	// 15分（コマンドのインタラクショントークンの有効期限）を超えて操作され得るため、
	// 以降のメッセージ編集は各コンポーネントのインタラクション経由で行う
	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		idle: TIMEOUT.COMPONENT_IDLE,
		filter: isCommandUser,
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

	collector.on("end", async (_collected, reason) => {
		if (reason === "cancel" || reason === "confirm") return;
		await clearComponents(message);
	});
}
