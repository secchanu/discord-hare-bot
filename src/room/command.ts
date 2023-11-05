import {
	ApplicationCommandOptionType,
	ButtonStyle,
	ComponentType,
} from "discord.js";
import type {
	ActionRowData,
	ApplicationCommandDataResolvable,
	CacheType,
	Interaction,
	InteractionButtonComponentData,
	StringSelectMenuComponentData,
} from "discord.js";

import { roomMap } from "./manager";
import GameRoom from "./game/GameRoom";
import { commands as gameCommands } from "./game/command";

//設定の読み込み
import config from "./config";

export const commands: ApplicationCommandDataResolvable[] = config.enable
	? [
			{
				name: "room",
				description: "部屋の設定",
				options: [
					{
						type: ApplicationCommandOptionType.Subcommand,
						name: "sync",
						description: "専用チャットの同期",
					},
					{
						type: ApplicationCommandOptionType.Subcommand,
						name: "vc",
						description: "追加VC数の変更（25個まで）",
						options: [
							{
								type: ApplicationCommandOptionType.Integer,
								minValue: 0,
								name: "number",
								description: "VC数（指定無しの場合無し）",
							},
						],
					},
					...(config.useGame
						? ([
								{
									type: ApplicationCommandOptionType.Subcommand,
									name: "game",
									description: "ゲームの変更",
									options: [
										{
											type: ApplicationCommandOptionType.Role,
											name: "game",
											description: "ゲーム",
											required: true,
										},
									],
								},
						  ] as const)
						: []),
				],
			},
			{
				name: "team",
				description: "メンバーをチームに分ける",
				options: [
					{
						type: ApplicationCommandOptionType.Integer,
						minValue: 2,
						name: "number",
						description: "チーム数（指定無しの場合2チーム）",
						required: false,
					},
				],
			},
			{
				name: "call",
				description: "メンバー全員を1つのVCに集合させる",
				options: [
					{
						type: ApplicationCommandOptionType.Integer,
						minValue: 0,
						name: "number",
						description: "移動先VC（指定無しの場合一番上のVC）",
						required: false,
					},
				],
			},
			{
				name: "rand",
				description: "ランダム",
				options: [
					{
						type: ApplicationCommandOptionType.Subcommand,
						name: "member",
						description: "部屋のメンバーから",
						options: [
							{
								type: ApplicationCommandOptionType.Integer,
								minValue: 1,
								name: "number",
								description: "選択数 (指定無しの場合1人)",
								required: false,
							},
						],
					},
					...(config.useGame
						? ([
								{
									type: ApplicationCommandOptionType.Subcommand,
									name: "data",
									description: "ゲーム固有データから",
								},
						  ] as const)
						: []),
				],
			},
			...gameCommands,
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

	const key = interaction.channel?.parentId;
	if (!key) return;
	const room = roomMap.get(key);
	if (!room) return;

	try {
		switch (interaction.commandName) {
			case "room": {
				switch (interaction.options.getSubcommand()) {
					case "sync": {
						await interaction.reply(
							"専用チャットを部屋のメンバーに同期しています…",
						);
						await room.syncViewableTC();
						await interaction.editReply(
							"専用チャットを部屋のメンバーに同期しました",
						);
						break;
					}
					case "vc": {
						await interaction.reply("追加VC数を変更しています…");
						const number = interaction.options.getInteger("number") ?? 0;
						const num = Math.max(0, Math.min(number, 25));
						await room.setVC(num);
						await interaction.editReply(`追加VC数を${num}に変更しました`);
						break;
					}
					case "game": {
						await interaction.deferReply();
						const role = interaction.options.getRole("game", true);
						const key = role.id;
						if (config.ignoreRoleIds.includes(key)) {
							await interaction.editReply(
								"このロールはゲームとして選択できません",
							);
							break;
						}
						if (!interaction.member.roles.resolve(key)) {
							await interaction.editReply(
								"このゲームは付与されていないため選択できません\n先に<id:customize>からプレイするゲームとして選択してください",
							);
							break;
						}
						const game = await (room as GameRoom).setGame(key);
						if (!game) {
							await interaction.editReply("ゲームの設定に失敗しました");
							break;
						}
						await interaction.editReply(
							`ゲームを「${game.name}」に変更しました`,
						);
						break;
					}
				}
				break;
			}
			case "team": {
				await interaction.deferReply();
				const number = interaction.options.getInteger("number") ?? 2;
				const channel = interaction.member.voice.channel;
				if (!channel) {
					await interaction.editReply("VCに接続していません");
					break;
				}
				const members = channel.members.filter((m) => !m.user.bot);
				const division = Math.max(2, Math.min(number, members.size));
				const base = Math.floor(members.size / division);
				const rest = members.size % division;
				const getTeams = () => {
					const players = members.clone();
					const teams = new Array(division).fill(null).map((_, i) => {
						const count = base + Number(i < rest);
						const rands = players.random(count);
						players.sweep((m) => rands.includes(m));
						return rands;
					});
					return teams;
				};
				const actionComponents: ActionRowData<InteractionButtonComponentData>[] =
					[
						{
							type: ComponentType.ActionRow,
							components: [
								{
									type: ComponentType.Button,
									customId: "cancel",
									style: ButtonStyle.Danger,
									label: "キャンセル",
								},
								{
									type: ComponentType.Button,
									customId: "confirm",
									style: ButtonStyle.Success,
									label: "確定",
								},
								{
									type: ComponentType.Button,
									customId: "reroll",
									style: ButtonStyle.Primary,
									label: "再抽選",
								},
							],
						},
					];
				const moveComponents: ActionRowData<InteractionButtonComponentData>[] =
					[
						{
							type: ComponentType.ActionRow,
							components: [
								{
									type: ComponentType.Button,
									customId: "move",
									style: ButtonStyle.Primary,
									label: "移動",
								},
							],
						},
					];
				let teams = getTeams();
				const message = await interaction.editReply({
					content: teams
						.map((members, i) => {
							return `チーム${i + 1}\n${members
								.map((m) => m.toString())
								.join("\n")}`;
						})
						.join("\n\n"),
					components: actionComponents,
				});
				const collector =
					message.createMessageComponentCollector<ComponentType.Button>({
						filter: (i) =>
							i.user.id === interaction.user.id &&
							["cancel", "confirm", "reroll", "move"].includes(i.customId),
					});
				collector.on("collect", async (int) => {
					switch (int.customId) {
						case "cancel": {
							collector.stop();
							await int.message.delete();
							break;
						}
						case "confirm": {
							await int.deferUpdate();
							await int.editReply({ components: moveComponents });
							break;
						}
						case "reroll": {
							await int.deferUpdate();
							teams = getTeams();
							await int.editReply({
								content: teams
									.map((members, i) => {
										return `チーム${i + 1}\n${members
											.map((m) => m.toString())
											.join("\n")}`;
									})
									.join("\n\n"),
								components: actionComponents,
							});
							break;
						}
						case "move": {
							await int.deferUpdate();
							if (room.getVC() < division) await room.setVC(division);
							const moves = teams
								.map((members, index) => {
									return members.map(async (member) => {
										const voiceState = member.voice;
										return room.move(voiceState, index + 1);
									});
								})
								.flat();
							await Promise.all(moves);
							await int.editReply({});
							break;
						}
					}
				});
				break;
			}
			case "call": {
				await interaction.reply("メンバーを集合させています…");
				const number = interaction.options.getInteger("number") ?? 0;
				await room.call(number);
				await interaction.editReply("メンバーを集合させました");
				break;
			}
			case "rand": {
				switch (interaction.options.getSubcommand()) {
					case "member": {
						await interaction.deferReply();
						const number = interaction.options.getInteger("number") ?? 1;
						const channel = interaction.member.voice.channel;
						if (!channel) {
							await interaction.editReply("VCに接続していません");
							break;
						}
						const members = channel.members.filter((m) => !m.user.bot);
						const pickedMembers = members.random(number);
						const content = pickedMembers.join("\n");
						await interaction.editReply(content);
						break;
					}
					case "data": {
						await interaction.deferReply();
						const game = (room as GameRoom).game;
						const data = game.data;
						if (!Object.keys(data).length) {
							interaction.editReply(
								`抽選できるデータがありません\n部屋のゲームを確認してください\n現在のゲームは「${game.name}」です`,
							);
							break;
						}
						const content = "抽選するデータを選択してください";
						const customId = "data_key";
						const components: ActionRowData<StringSelectMenuComponentData>[] = [
							{
								type: ComponentType.ActionRow,
								components: [
									{
										type: ComponentType.StringSelect,
										customId,
										options: Object.keys(data).map((name) => {
											return { label: name, value: name };
										}),
										placeholder: "データを選択",
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
						await res.deferUpdate();
						const dataKey = res.values.at(0);
						if (!dataKey || !(dataKey in data)) {
							await interaction.editReply("データの取得に失敗しました");
							break;
						}
						const items = data[dataKey];
						const getRand = () =>
							items[Math.floor(Math.random() * items.length)];
						const actionComponents: ActionRowData<InteractionButtonComponentData>[] =
							[
								{
									type: ComponentType.ActionRow,
									components: [
										{
											type: ComponentType.Button,
											customId: "cancel",
											style: ButtonStyle.Danger,
											label: "キャンセル",
										},
										{
											type: ComponentType.Button,
											customId: "confirm",
											style: ButtonStyle.Success,
											label: "確定",
										},
										{
											type: ComponentType.Button,
											customId: "reroll",
											style: ButtonStyle.Primary,
											label: "再抽選",
										},
									],
								},
							];
						await res.editReply({
							content: getRand(),
							components: actionComponents,
						});
						const collector =
							message.createMessageComponentCollector<ComponentType.Button>({
								filter: (i) =>
									i.user.id === interaction.user.id &&
									["cancel", "confirm", "reroll"].includes(i.customId),
							});
						collector.on("collect", async (int) => {
							switch (int.customId) {
								case "cancel": {
									collector.stop();
									await int.message.delete();
									break;
								}
								case "confirm": {
									collector.stop();
									await int.update({ components: [] });
									break;
								}
								case "reroll": {
									await int.deferUpdate();
									await int.editReply({
										content: getRand(),
										components: actionComponents,
									});
									break;
								}
							}
						});
						break;
					}
				}
			}
		}
	} catch (error) {
		console.log(error);
	}
};
