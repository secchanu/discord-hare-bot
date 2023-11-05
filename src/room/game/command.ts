import {
	ApplicationCommandOptionType,
	ComponentType,
	TextInputStyle,
	inlineCode,
} from "discord.js";
import type {
	ActionRowData,
	ApplicationCommandDataResolvable,
	CacheType,
	Interaction,
	ModalComponentData,
	StringSelectMenuComponentData,
} from "discord.js";

import { createGame, gameMap } from "./manager";

//設定の読み込み
import config from "../config";

export const commands: ApplicationCommandDataResolvable[] = config.useGame
	? [
			{
				name: "game",
				description: "ゲームの設定",
				options: [
					{
						type: ApplicationCommandOptionType.Subcommand,
						name: "data",
						description: "ゲームデータの編集",
						options: [
							{
								type: ApplicationCommandOptionType.Role,
								name: "game",
								description: "ゲーム",
								required: true,
							},
						],
					},
				],
			},
	  ]
	: [];

/**
 * スラッシュコマンドの処理
 * Events.InteractionCreate
 */
export const interactionHandler = async (
	interaction: Interaction<CacheType>,
) => {
	if (!interaction.isChatInputCommand()) return;
	if (!interaction.inCachedGuild()) return;

	try {
		switch (interaction.commandName) {
			case "game": {
				switch (interaction.options.getSubcommand()) {
					case "data": {
						await interaction.deferReply();
						const role = interaction.options.getRole("game", true);
						const everyoneRoleId = interaction.guild.roles.everyone.id;
						const key = role.id;
						if (key === everyoneRoleId || config.ignoreRoleIds.includes(key)) {
							await interaction.editReply(
								`このロールはゲームとして選択できません`,
							);
							break;
						}
						if (!interaction.member.roles.resolve(key)) {
							await interaction.editReply(
								"このゲームは付与されていないため選択できません\n先に<id:customize>からプレイするゲームとして選択してください",
							);
							break;
						}
						const game = gameMap.get(key) ?? createGame(role);
						const data = game.data;
						const content = `${game.name}: 編集するデータを選択してください`;
						const customId = "data_key";
						const components: ActionRowData<StringSelectMenuComponentData>[] = [
							{
								type: ComponentType.ActionRow,
								components: [
									{
										type: ComponentType.StringSelect,
										customId,
										options: Object.keys(data)
											.map((key) => ({
												label: key,
												value: key,
											}))
											.concat([{ label: "新規作成", value: "新規作成" }])
											.slice(0, 25),
										placeholder: "データ",
									},
								],
							},
						];
						const message = await interaction.editReply({
							content,
							components,
						});
						const res = await message
							.awaitMessageComponent<ComponentType.StringSelect>({
								filter: (i) =>
									i.user.id === interaction.user.id && i.customId === customId,
							})
							.catch(() => null);
						if (!res) return;
						const dataKey = res.values.at(0);
						const isExist = dataKey && dataKey in data;
						const items = isExist ? data[dataKey] : [];
						const modalId = `game_data_${message.id}`;
						const modal: ModalComponentData = {
							customId: modalId,
							title: `${game.name}: ゲームデータの編集`,
							components: [
								{
									type: ComponentType.ActionRow,
									components: [
										{
											type: ComponentType.TextInput,
											style: TextInputStyle.Short,
											customId: "key",
											label: "データ名",
											value: isExist ? dataKey : "",
											required: true,
										},
									],
								},
								{
									type: ComponentType.ActionRow,
									components: [
										{
											type: ComponentType.TextInput,
											style: TextInputStyle.Paragraph,
											customId: "data",
											label: "データ（改行区切り）",
											value: items.join("\n"),
											required: false,
										},
									],
								},
							],
						};
						await res.showModal(modal);
						const form = await res
							.awaitModalSubmit({
								filter: (i) =>
									i.user.id === interaction.user.id && i.customId === modalId,
								time: 60 * 60 * 1000,
							})
							.catch(() => null);
						if (!form) return;
						form.deferUpdate({});
						const newKey = form.fields.getTextInputValue("key").trim();
						const newData = form.fields
							.getTextInputValue("data")
							.split("\n")
							.map((d) => d.trim())
							.filter((d) => d);
						const update = inlineCode(newData.join(", "));
						if (!newKey) {
							await interaction.editReply({
								content: `${game.name}: データ名が入力されていません`,
								components: [],
							});
							break;
						}
						if (!newData.length) {
							delete data[newKey];
							await interaction.editReply({
								content: `${game.name}: 「${newKey}」のデータを削除しました`,
								components: [],
							});
						} else if (isExist) {
							delete data[dataKey];
							data[newKey] = newData;
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
							data[newKey] = newData;
							await interaction.editReply({
								content: `${game.name}: 「${newKey}」のデータを作成しました\n${update}`,
								components: [],
							});
						}
						gameMap.save();
						break;
					}
				}
			}
		}
	} catch (error) {
		console.log(error);
	}
};
