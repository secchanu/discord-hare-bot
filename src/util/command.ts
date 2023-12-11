import {
	ApplicationCommandOptionType,
	ButtonStyle,
	ComponentType,
	TextInputStyle,
} from "discord.js";
import type {
	ActionRowData,
	ApplicationCommandDataResolvable,
	ButtonComponentData,
	CacheType,
	Interaction,
	ModalComponentData,
	Snowflake,
	StringSelectMenuComponentData,
} from "discord.js";

//設定の読み込み
import config from "./config";

export const commands: ApplicationCommandDataResolvable[] = config.enable
	? [
			{
				name: "vote",
				description: "投票",
				options: [
					{
						type: ApplicationCommandOptionType.Integer,
						minValue: 1,
						maxValue: 25,
						name: "number",
						description: "1人あたりの最大選択数（指定無しの場合1票）",
						required: false,
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
	if (!interaction.inCachedGuild()) return;

	if (interaction.isChatInputCommand()) {
		try {
			switch (interaction.commandName) {
				case "vote": {
					const number = interaction.options.getInteger("number") ?? 1;
					const modalId = `vote_data_${interaction.id}`;
					const modal: ModalComponentData = {
						customId: modalId,
						title: `投票の作成`,
						components: [
							{
								type: ComponentType.ActionRow,
								components: [
									{
										type: ComponentType.TextInput,
										style: TextInputStyle.Short,
										customId: "key",
										label: "投票名",
										required: true,
										maxLength: 100,
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
										label: "選択肢（改行区切り）※最大25個まで",
										required: true,
										maxLength: 1600,
									},
								],
							},
						],
					};
					await interaction.showModal(modal);
					const form = await interaction
						.awaitModalSubmit({
							filter: (i) =>
								i.user.id === interaction.user.id && i.customId === modalId,
							time: 60 * 60 * 1000,
						})
						.catch(() => null);
					if (!form) return;
					form.deferUpdate({});
					const key = form.fields.getTextInputValue("key").trim();
					const data = form.fields
						.getTextInputValue("data")
						.split("\n")
						.map((d) => d.trim())
						.filter((d) => d);
					const maxValues = Math.min(number, data.length);
					const voteMap = new Map<Snowflake, number[]>();
					const getContent = () => {
						const results = data.map((name, index) => {
							return {
								name,
								vote: Array.from(voteMap.values())
									.flat()
									.filter((v) => v === index).length,
							};
						});
						results.sort((a, b) => {
							return a.vote > b.vote ? -1 : 1;
						});
						const content = `# ${key}\n${results
							.map(({ name, vote }) => `**${name} - ${vote}**票`)
							.join("\n")}`;
						return content;
					};
					const components: ActionRowData<
						StringSelectMenuComponentData | ButtonComponentData
					>[] = [
						{
							type: ComponentType.ActionRow,
							components: [
								{
									type: ComponentType.StringSelect,
									customId: "vote",
									options: data
										.map((name, i) => {
											return { label: name, value: `${i}` };
										})
										.slice(0, 25),
									maxValues,
									placeholder: `投票先を${maxValues}つまで選択`,
								},
							],
						},
						{
							type: ComponentType.ActionRow,
							components: [
								{
									type: ComponentType.Button,
									customId: "confirm",
									style: ButtonStyle.Success,
									label: "締切",
								},
							],
						},
					];
					const message = await interaction.followUp({
						content: getContent(),
						components,
					});
					const collector =
						message.createMessageComponentCollector<ComponentType.StringSelect>(
							{
								filter: (i) => i.customId === "vote",
							},
						);
					collector.on("collect", async (int) => {
						const key = int.user.id;
						const values = int.values.map((v) => Number(v ?? ""));
						voteMap.set(key, values);
						await int.update({
							content: getContent(),
						});
					});
					await message.awaitMessageComponent<ComponentType.Button>({
						filter: (i) =>
							i.user.id === interaction.user.id && i.customId === "confirm",
					});
					collector.stop();
					await message.edit({
						content: getContent(),
						components: [],
					});
					break;
				}
			}
		} catch (error) {
			console.log(error);
		}
	}
};
