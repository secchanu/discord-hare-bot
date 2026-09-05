import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Collection,
	type GuildMember,
	MessageFlags,
	SlashCommandBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from "discord.js";
import { DISCORD_LIMITS, TIMEOUT } from "../constants";
import {
	clearComponents,
	createCommandUserFilter,
	createDrawButtonRow,
	GUILD_ONLY_MESSAGE,
	isGuildInteraction,
	ROOM_ONLY_MESSAGE,
} from "./helpers";
import { getRoomFromVoiceChannel } from "./helpers/room";
import type { CommandHandler } from "./types";

const NOT_ENOUGH_MEMBERS_MESSAGE = "チーム分けには2人以上のメンバーが必要です";

/**
 * /team コマンド
 * メンバーをチームに分ける
 */
export const teamCommand: CommandHandler = {
	data: new SlashCommandBuilder()
		.setName("team")
		.setDescription("メンバーをチームに分ける")
		.addIntegerOption((option) =>
			option.setName("number").setDescription("チーム数（指定無しの場合2チーム）").setMinValue(2),
		),

	async execute(interaction, ctx) {
		if (!isGuildInteraction(interaction)) {
			await interaction.reply({ content: GUILD_ONLY_MESSAGE, flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply();

		const room = getRoomFromVoiceChannel(interaction, ctx.roomManager);
		if (!room) {
			await interaction.editReply(ROOM_ONLY_MESSAGE);
			return;
		}

		const channel = interaction.member.voice.channel;
		if (!channel) {
			await interaction.editReply("このコマンドはルーム内のボイスチャンネルでのみ使用できます");
			return;
		}

		const number = interaction.options.getInteger("number") ?? 2;
		// チーム分けの候補（VC内のbot以外）
		const candidates = channel.members.filter((m: GuildMember) => !m.user.bot);
		if (candidates.size < 2) {
			await interaction.editReply(NOT_ENOUGH_MEMBERS_MESSAGE);
			return;
		}

		// 除外メニューで選ばれたメンバー
		let excludedIds = new Set<string>();

		// チーム分け関数
		const createTeams = (): Collection<string, GuildMember>[] => {
			const members = candidates.filter((m: GuildMember) => !excludedIds.has(m.id));
			const teamCount = Math.max(2, Math.min(number, members.size));
			const shuffled = members.clone();
			const teams: Collection<string, GuildMember>[] = [];
			const baseSize = Math.floor(members.size / teamCount);
			const remainder = members.size % teamCount;

			for (let i = 0; i < teamCount; i++) {
				const size = baseSize + (i < remainder ? 1 : 0);
				const teamMembersArray = shuffled.random(size);
				const teamMembers = new Collection<string, GuildMember>();
				for (const m of teamMembersArray) {
					teamMembers.set(m.id, m);
				}
				teams.push(teamMembers);
				shuffled.sweep((m: GuildMember) => teamMembers.has(m.id));
			}

			return teams;
		};

		let teams = createTeams();

		// 除外メニュー: 選択状態を反映するため描画のたびに組み立てる
		const buildExcludeRow = () =>
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId("exclude")
					.setPlaceholder("除外するメンバーを選択")
					.setMinValues(0)
					.setMaxValues(Math.min(candidates.size, DISCORD_LIMITS.MAX_SELECT_MENU_OPTIONS))
					.addOptions(
						candidates
							.first(DISCORD_LIMITS.MAX_SELECT_MENU_OPTIONS)
							.map((m) =>
								new StringSelectMenuOptionBuilder()
									.setLabel(m.displayName)
									.setValue(m.id)
									.setDefault(excludedIds.has(m.id)),
							),
					),
			);

		const actionRow = createDrawButtonRow();

		const moveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("move").setLabel("移動").setStyle(ButtonStyle.Primary),
		);

		// 抽選中の表示
		const buildDrawingRows = () => [buildExcludeRow(), actionRow];

		// チーム表示
		const formatTeams = () => {
			const teamList = teams
				.map((members, i) => {
					const memberList = members.map((m: GuildMember) => m.toString()).join("\n");
					return `チーム${i + 1}\n${memberList}`;
				})
				.join("\n\n");
			if (excludedIds.size === 0) return teamList;
			const excludedList = candidates
				.filter((m: GuildMember) => excludedIds.has(m.id))
				.map((m: GuildMember) => m.toString())
				.join(" ");
			return `${teamList}\n\n除外: ${excludedList}`;
		};

		const message = await interaction.editReply({
			content: formatTeams(),
			components: buildDrawingRows(),
		});

		// セッションUI: 無操作が続いたら終了する。
		// 15分（コマンドのインタラクショントークンの有効期限）を超えて操作され得るため、
		// 以降のメッセージ編集は各コンポーネントのインタラクション経由で行う
		const collector = message.createMessageComponentCollector({
			idle: TIMEOUT.COMPONENT_IDLE,
			filter: createCommandUserFilter(interaction.user.id),
		});

		collector.on("collect", async (componentInteraction) => {
			switch (componentInteraction.customId) {
				case "exclude": {
					if (!componentInteraction.isStringSelectMenu()) break;
					const selectedIds = new Set(componentInteraction.values);
					if (candidates.size - selectedIds.size < 2) {
						// 選択を受け付けず、直前の状態を描画し直す
						await componentInteraction.update({
							content: formatTeams(),
							components: buildDrawingRows(),
						});
						await componentInteraction.followUp({
							content: NOT_ENOUGH_MEMBERS_MESSAGE,
							flags: MessageFlags.Ephemeral,
						});
						break;
					}
					excludedIds = selectedIds;
					teams = createTeams();
					await componentInteraction.update({
						content: formatTeams(),
						components: buildDrawingRows(),
					});
					break;
				}

				case "cancel":
					collector.stop("cancel");
					await componentInteraction.deferUpdate();
					await componentInteraction.deleteReply();
					break;

				case "confirm":
					await componentInteraction.update({ components: [moveRow] });
					break;

				case "reroll":
					teams = createTeams();
					await componentInteraction.update({
						content: formatTeams(),
						components: buildDrawingRows(),
					});
					break;

				case "move": {
					await componentInteraction.deferUpdate();

					// 必要なVCを確保（チーム数と同じ数の追加VCが必要）
					if (room.additionalVoiceChannelCount < teams.length) {
						await room.setAdditionalVoiceChannels(teams.length);
					}

					// チームごとに移動（すべてのチームを追加VCに移動）
					const movePromises = teams.flatMap((teamMembers, index) =>
						teamMembers.map((member) => room.moveMembers(member.voice, index + 1)),
					);

					await Promise.all(movePromises);
					await componentInteraction.editReply({
						content: formatTeams(),
						components: [moveRow],
					});
					break;
				}
			}
		});

		collector.on("end", async (_collected, reason) => {
			if (reason === "cancel") return;
			await clearComponents(message);
		});
	},
};
