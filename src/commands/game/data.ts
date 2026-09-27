import {
	ActionRowBuilder,
	InteractionCollector,
	inlineCode,
	ModalBuilder,
	type ModalSubmitInteraction,
	type Role,
	StringSelectMenuBuilder,
	type StringSelectMenuInteraction,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import type { AppContext } from "../../bot/context";
import { DISCORD_LIMITS, TIMEOUT } from "../../constants";
import { clearComponents, createCommandUserFilter, replyError, TIMEOUT_MESSAGE } from "../helpers";
import { getGameRoleError, INVALID_GAME_ROLE_MESSAGE } from "../helpers/game";
import type { GuildCommandInteraction } from "../types";

/**
 * /game data サブコマンド
 * ゲームのデータを編集する
 */
export async function handleData(
	interaction: GuildCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	// @everyone はデフォルトゲームを表すため、選択できないロールと同じエラーを返す
	const role = interaction.options.getRole("game", true) as Role;
	const roleError =
		role.id === interaction.guild.roles.everyone.id
			? INVALID_GAME_ROLE_MESSAGE
			: getGameRoleError(interaction, role, ctx);
	if (roleError) {
		await replyError(interaction, roleError);
		return;
	}

	const roleId = role.id;
	const gameManager = ctx.gameManager;

	await interaction.deferReply();

	const game = (await gameManager.getGame(roleId)) ?? (await gameManager.createGame(role));

	const gameName = game.name;
	const gameData = game.data;

	// 既存のデータは、新規作成の分を空けて上限まで並べる
	const options = Object.keys(gameData)
		.slice(0, DISCORD_LIMITS.MAX_SELECT_MENU_OPTIONS - 1)
		.map((key) => ({ label: key, value: key }))
		.concat([{ label: "新規作成", value: "新規作成" }]);

	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId("data_key")
		.setPlaceholder("データ")
		.addOptions(options);

	const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

	const message = await interaction.editReply({
		content: `${gameName}: 編集するデータを選択してください`,
		components: [selectRow],
	});

	/**
	 * モーダルの入力内容でゲームデータを更新し、結果を表示する
	 */
	const saveData = async (
		modalInteraction: ModalSubmitInteraction,
		dataKey: string,
		exists: boolean,
	) => {
		await modalInteraction.deferUpdate();

		const newKey = modalInteraction.fields.getTextInputValue("key").trim();
		const newData = modalInteraction.fields
			.getTextInputValue("data")
			.split("\n")
			.map((d) => d.trim())
			.filter((d) => d);

		if (!newKey) {
			await replyError(modalInteraction, `${gameName}: データ名が入力されていません`);
			return;
		}

		if (!newData.length) {
			await gameManager.updateGameData(roleId, newKey, null);
			await modalInteraction.editReply({
				content: `${gameName}: 「${newKey}」のデータを削除しました`,
				components: [],
			});
			return;
		}

		const update = inlineCode(newData.join(", "));
		if (!exists) {
			await gameManager.updateGameData(roleId, newKey, newData);
			await modalInteraction.editReply({
				content: `${gameName}: 「${newKey}」のデータを作成しました\n${update}`,
				components: [],
			});
			return;
		}

		// データ名の変更に対応するため、古いデータ名を削除してから保存する
		await gameManager.updateGameData(roleId, dataKey, null);
		await gameManager.updateGameData(roleId, newKey, newData);
		const content =
			dataKey === newKey
				? `${gameName}: 「${newKey}」のデータを更新しました\n${update}`
				: `${gameName}: 「${dataKey}」のデータを「${newKey}」に更新しました\n${update}`;
		await modalInteraction.editReply({ content, components: [] });
	};

	// セレクトメニューの操作とモーダル送信を1つのセッションで受け付ける
	// モーダル送信は開いた元のメッセージに紐づくため、同じコレクターで受け取れる
	const collector = new InteractionCollector<StringSelectMenuInteraction | ModalSubmitInteraction>(
		interaction.client,
		{
			message,
			filter: createCommandUserFilter(interaction.user.id),
			idle: TIMEOUT.COMPONENT_IDLE,
		},
	);

	// 開いたモーダルごとの編集対象
	// モーダルを閉じて選び直すと新しいモーダルが開くため、複数のモーダルを並行して扱う
	const openedModals = new Map<string, { dataKey: string; exists: boolean }>();

	await new Promise<void>((resolve) => {
		collector.on("collect", async (collected) => {
			if (collected.isModalSubmit()) {
				const target = openedModals.get(collected.customId);
				if (!target) return;
				collector.stop("submit");
				await saveData(collected, target.dataKey, target.exists);
				resolve();
				return;
			}

			const selectInteraction = collected;
			const dataKey = selectInteraction.values[0];
			const exists = dataKey !== "新規作成" && dataKey in gameData;
			const items = exists ? gameData[dataKey] : [];

			const modalId = `game_data_${selectInteraction.id}`;
			const modal = new ModalBuilder()
				.setCustomId(modalId)
				.setTitle(`${gameName}: ゲームデータの編集`)
				.addComponents(
					new ActionRowBuilder<TextInputBuilder>().addComponents(
						new TextInputBuilder()
							.setCustomId("key")
							.setLabel("データ名")
							.setStyle(TextInputStyle.Short)
							.setValue(exists ? dataKey : "")
							.setRequired(true),
					),
					new ActionRowBuilder<TextInputBuilder>().addComponents(
						new TextInputBuilder()
							.setCustomId("data")
							.setLabel("データ（改行区切り）")
							.setStyle(TextInputStyle.Paragraph)
							.setValue(items.join("\n"))
							.setRequired(false),
					),
				);

			openedModals.set(modalId, { dataKey, exists });
			await selectInteraction.showModal(modal);

			// セレクトメニューを描き直して選択状態を戻し、同じデータも選び直せるようにする
			if (!collector.ended) {
				await message.edit({ components: [selectRow] });
			}
		});

		collector.on("end", async (_collected, reason) => {
			if (reason === "submit") return;
			await clearComponents(message, TIMEOUT_MESSAGE);
			resolve();
		});
	});
}
