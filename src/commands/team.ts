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
	MOVE_FAILED_MESSAGE,
	ROOM_ONLY_MESSAGE,
	replyError,
} from "./helpers";
import { getRoomFromVoiceAndTextChannel } from "./helpers/room";
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
		// 移動ボタンはルームがある間残すため、結果はそのルーム内のチャンネルに出す
		// ルームの削除でチャンネルごとメッセージが消えると、コレクターも終了する
		const room = getRoomFromVoiceAndTextChannel(interaction, ctx.roomManager);
		const channel = interaction.member.voice.channel;
		if (!room || !channel) {
			await replyError(interaction, ROOM_ONLY_MESSAGE);
			return;
		}

		const number = interaction.options.getInteger("number") ?? 2;
		// チーム分けの候補は、ボイスチャンネルにいる Bot 以外のメンバー
		const candidates = channel.members.filter((m: GuildMember) => !m.user.bot);
		if (candidates.size < 2) {
			await replyError(interaction, NOT_ENOUGH_MEMBERS_MESSAGE);
			return;
		}

		await interaction.deferReply();

		// 除外メニューで選ばれたメンバー
		let excludedIds = new Set<string>();

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

		// 除外メニューは、選択状態を反映するため描画のたびに組み立てる
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

		const buildDrawingRows = () => [buildExcludeRow(), actionRow];

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

		const filter = createCommandUserFilter(interaction.user.id);

		// 確定後の移動セッションは、同じチームで試合を繰り返すため、ルームが削除されるまで残す
		const startMoveSession = () => {
			const moveCollector = message.createMessageComponentCollector({ filter });

			moveCollector.on("collect", async (componentInteraction) => {
				if (componentInteraction.customId !== "move") return;
				await componentInteraction.deferUpdate();

				// 各チームを番号の同じ追加ボイスチャンネルへ移動するため、チーム数まで追加ボイスチャンネルを増やす
				if (room.additionalVoiceChannelCount < teams.length) {
					await room.setAdditionalVoiceChannels(teams.length);
				}

				const results = await Promise.all(
					teams.flatMap((teamMembers, index) =>
						teamMembers.map((member) => room.moveMembers(member.voice, index + 1)),
					),
				);

				await componentInteraction.editReply({
					content: formatTeams(),
					components: [moveRow],
				});
				// 移動ボタンは同じチームでの再移動に使うため残し、失敗は操作した人にだけ伝える
				if (!results.every(Boolean)) {
					await componentInteraction.followUp({
						content: MOVE_FAILED_MESSAGE,
						flags: MessageFlags.Ephemeral,
					});
				}
			});
		};

		const collector = message.createMessageComponentCollector({
			idle: TIMEOUT.COMPONENT_IDLE,
			filter,
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
					collector.stop("confirm");
					startMoveSession();
					await componentInteraction.update({ components: [moveRow] });
					break;

				case "reroll":
					teams = createTeams();
					await componentInteraction.update({
						content: formatTeams(),
						components: buildDrawingRows(),
					});
					break;
			}
		});

		collector.on("end", async (_collected, reason) => {
			// 確定後は移動セッションがメッセージを引き継ぐ
			if (reason === "cancel" || reason === "confirm") return;
			await clearComponents(message);
		});
	},
};
