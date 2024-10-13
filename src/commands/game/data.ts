import {
	ActionRowBuilder,
	type ChatInputCommandInteraction,
	ComponentType,
	inlineCode,
	ModalBuilder,
	type Role,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { config } from "../../bot/config";
import { DISCORD_LIMITS, TIMEOUT } from "../../constants";
import { GameManager } from "../../features/games/GameManager";
import { hasRoleManager } from "../../types/guards";
import { isGuildInteraction } from "../helpers";

/**
 * /game data サブコマンド
 * ゲームデータの編集
 */
export async function handleData(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!isGuildInteraction(interaction)) {
		await interaction.reply({
			content: "このコマンドはサーバー内でのみ使用できます。",
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply();

	const role = interaction.options.getRole("game", true) as Role;
	const everyoneRoleId = interaction.guild.roles.everyone.id;
	const roleId = role.id;

	// 無効なロールチェック
	if (roleId === everyoneRoleId || config.ignoreRoleIds.includes(roleId)) {
		await interaction.editReply("このロールはゲームとして選択できません");
		return;
	}

	// メンバーがロールを持っているかチェック
	if (
		!hasRoleManager(interaction.member) ||
		!interaction.member.roles.cache.has(roleId)
	) {
		await interaction.editReply(
			"このゲームは付与されていないため選択できません\n先に<id:customize>からプレイするゲームとして選択してください",
		);
		return;
	}

	const gameManager = GameManager.getInstance();
	let game = await gameManager.getGame(roleId);

	// ゲームが存在しない場合は作成
	if (!game) {
		game = await gameManager.createGame(role);
	}

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

	const selectRow =
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

	const message = await interaction.editReply({
		content: `${game.name}: 編集するデータを選択してください`,
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

	const dataKey = selectInteraction.values[0];
	const isExist = dataKey !== "新規作成" && dataKey in gameData;
	const items = isExist ? gameData[dataKey] : [];

	// モーダルで編集
	const modal = new ModalBuilder()
		.setCustomId(`game_data_${message.id}`)
		.setTitle(`${game.name}: ゲームデータの編集`)
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				new TextInputBuilder()
					.setCustomId("key")
					.setLabel("データ名")
					.setStyle(TextInputStyle.Short)
					.setValue(isExist ? dataKey : "")
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

	// モーダル送信を待つ
	const modalInteraction = await selectInteraction
		.awaitModalSubmit({
			filter: (i) =>
				i.user.id === interaction.user.id &&
				i.customId === modal.data.custom_id,
			time: TIMEOUT.MODAL_SUBMIT,
		})
		.catch(() => null);

	if (!modalInteraction) return;

	await modalInteraction.deferUpdate();

	const newKey = modalInteraction.fields.getTextInputValue("key").trim();
	const newData = modalInteraction.fields
		.getTextInputValue("data")
		.split("\n")
		.map((d) => d.trim())
		.filter((d) => d);

	if (!newKey) {
		await interaction.editReply({
			content: `${game.name}: データ名が入力されていません`,
			components: [],
		});
		return;
	}

	// データを更新
	if (!newData.length) {
		// データ削除
		await gameManager.updateGameData(roleId, newKey, null);
		await interaction.editReply({
			content: `${game.name}: 「${newKey}」のデータを削除しました`,
			components: [],
		});
	} else if (isExist) {
		// データ更新
		await gameManager.updateGameData(roleId, dataKey, null); // 古いキーを削除
		await gameManager.updateGameData(roleId, newKey, newData);

		const update = inlineCode(newData.join(", "));
		if (dataKey !== newKey) {
			await interaction.editReply({
				content: `${game.name}: 「${dataKey}」のデータを「${newKey}」に更新しました\n${update}`,
				components: [],
			});
		} else {
			await interaction.editReply({
				content: `${game.name}: 「${newKey}」のデータを更新しました\n${update}`,
				components: [],
			});
		}
	} else {
		// データ作成
		await gameManager.updateGameData(roleId, newKey, newData);
		const update = inlineCode(newData.join(", "));
		await interaction.editReply({
			content: `${game.name}: 「${newKey}」のデータを作成しました\n${update}`,
			components: [],
		});
	}
}
