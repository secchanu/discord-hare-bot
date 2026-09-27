import { ActionRowBuilder, ComponentType, StringSelectMenuBuilder } from "discord.js";
import type { AppContext } from "../../bot/context";
import { DISCORD_LIMITS, TIMEOUT } from "../../constants";
import {
	clearComponents,
	createCommandUserFilter,
	createDrawButtonRow,
	ROOM_ONLY_MESSAGE,
	replyError,
	TIMEOUT_MESSAGE,
} from "../helpers";
import { getRoomFromTextChannel } from "../helpers/room";
import type { GuildCommandInteraction } from "../types";

/**
 * /rand data サブコマンド
 * ルームのゲームのデータから、項目をランダムに選ぶ
 */
export async function handleData(
	interaction: GuildCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	const room = getRoomFromTextChannel(interaction, ctx.roomManager);
	if (!room) {
		await replyError(interaction, ROOM_ONLY_MESSAGE);
		return;
	}

	// ルームのゲームはメモリ上のスナップショットのため、最新のデータをストアから取得する
	const game = (await ctx.gameManager.getGame(room.game.id)) ?? room.game;

	const gameData = game.data;
	if (!Object.keys(gameData).length) {
		await replyError(
			interaction,
			`抽選できるデータがありません\n部屋のゲームを確認してください\n現在のゲームは「${game.name}」です`,
		);
		return;
	}

	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId("data_key")
		.setPlaceholder("データを選択")
		.addOptions(
			Object.keys(gameData)
				.slice(0, DISCORD_LIMITS.MAX_SELECT_MENU_OPTIONS)
				.map((key) => ({ label: key, value: key })),
		);

	const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

	await interaction.deferReply();
	const message = await interaction.editReply({
		content: "抽選するデータを選択してください",
		components: [selectRow],
	});

	const isCommandUser = createCommandUserFilter(interaction.user.id);
	const selectInteraction = await message
		.awaitMessageComponent({
			componentType: ComponentType.StringSelect,
			filter: isCommandUser,
			time: TIMEOUT.COMPONENT_IDLE,
		})
		.catch(() => null);

	if (!selectInteraction) {
		await clearComponents(message, TIMEOUT_MESSAGE);
		return;
	}

	await selectInteraction.deferUpdate();

	// 空のデータは保存時に削除されるため、選択肢のデータには必ず項目がある
	const items = gameData[selectInteraction.values[0]];

	const getRandom = () => items[Math.floor(Math.random() * items.length)];

	const actionRow = createDrawButtonRow();

	await selectInteraction.editReply({
		content: getRandom(),
		components: [actionRow],
	});

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
