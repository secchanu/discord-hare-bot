import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	ComponentType,
	inlineCode,
	MessageFlags,
	ModalBuilder,
	type ModalSubmitInteraction,
	type Role,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import type { AppContext } from "../../bot/context";
import { DISCORD_LIMITS, TIMEOUT } from "../../constants";
import {
	clearComponents,
	createCommandUserFilter,
	GUILD_ONLY_MESSAGE,
	isGuildInteraction,
	TIMEOUT_MESSAGE,
} from "../helpers";
import { getGameRoleError, INVALID_GAME_ROLE_MESSAGE } from "../helpers/game";

/**
 * /game data サブコマンド
 * ゲームデータの編集
 */
export async function handleData(
	interaction: ChatInputCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	if (!isGuildInteraction(interaction)) {
		await interaction.reply({ content: GUILD_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
		return;
	}

	await interaction.deferReply();

	// @everyone はデフォルトゲームのため編集できない
	const role = interaction.options.getRole("game", true) as Role;
	const roleError =
		role.id === interaction.guild.roles.everyone.id
			? INVALID_GAME_ROLE_MESSAGE
			: getGameRoleError(interaction, role, ctx);
	if (roleError) {
		await interaction.editReply(roleError);
		return;
	}

	const roleId = role.id;
	const gameManager = ctx.gameManager;
	const game = (await gameManager.getGame(roleId)) ?? (await gameManager.createGame(role));

	const gameName = game.name;
	const gameData = game.data;

	// データ選択メニュー
	const options = Object.keys(gameData)
		.map((key) => ({ label: key, value: key }))
		.concat([{ label: "新規作成", value: "新規作成" }])
		.slice(0, DISCORD_LIMITS.MAX_SELECT_MENU_OPTIONS);

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

		// 元のコマンドのインタラクショントークンは15分で失効するため、
		// モーダル送信（最大1時間待つ）以降の編集はモーダル側のインタラクションで行う
		if (!newKey) {
			await modalInteraction.editReply({
				content: `${gameName}: データ名が入力されていません`,
				components: [],
			});
			return;
		}

		if (!newData.length) {
			// データ削除
			await gameManager.updateGameData(roleId, newKey, null);
			await modalInteraction.editReply({
				content: `${gameName}: 「${newKey}」のデータを削除しました`,
				components: [],
			});
			return;
		}

		const update = inlineCode(newData.join(", "));
		if (!exists) {
			// データ作成
			await gameManager.updateGameData(roleId, newKey, newData);
			await modalInteraction.editReply({
				content: `${gameName}: 「${newKey}」のデータを作成しました\n${update}`,
				components: [],
			});
			return;
		}

		// データ更新（データ名が変わった場合は古いデータ名を削除する）
		await gameManager.updateGameData(roleId, dataKey, null);
		await gameManager.updateGameData(roleId, newKey, newData);
		const content =
			dataKey === newKey
				? `${gameName}: 「${newKey}」のデータを更新しました\n${update}`
				: `${gameName}: 「${dataKey}」のデータを「${newKey}」に更新しました\n${update}`;
		await modalInteraction.editReply({ content, components: [] });
	};

	// データ選択を待つ。
	// モーダルのキャンセルは通知されないため、送信されるまでメニューを残して選び直せるようにする
	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.StringSelect,
		filter: createCommandUserFilter(interaction.user.id),
		idle: TIMEOUT.INTERACTION,
	});

	let submitted = false;

	await new Promise<void>((resolve) => {
		collector.on("collect", async (selectInteraction) => {
			const dataKey = selectInteraction.values[0];
			const exists = dataKey !== "新規作成" && dataKey in gameData;
			const items = exists ? gameData[dataKey] : [];

			// モーダルで編集
			const modal = new ModalBuilder()
				.setCustomId(`game_data_${selectInteraction.id}`)
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

			await selectInteraction.showModal(modal);

			// メニューを描き直して選択状態を戻し、同じデータも選び直せるようにする
			if (!collector.ended) {
				await message.edit({ components: [selectRow] });
			}

			// モーダル送信を待つ
			const modalInteraction = await selectInteraction
				.awaitModalSubmit({
					filter: (i) => i.user.id === interaction.user.id && i.customId === modal.data.custom_id,
					time: TIMEOUT.MODAL_SUBMIT,
				})
				.catch(() => null);

			if (!modalInteraction || submitted) return;
			submitted = true;
			collector.stop("submit");

			await saveData(modalInteraction, dataKey, exists);
			resolve();
		});

		collector.on("end", async (_collected, reason) => {
			if (reason === "submit") return;
			await clearComponents(message, TIMEOUT_MESSAGE);
			resolve();
		});
	});
}
