import {
	ActionRowBuilder,
	Collection,
	type GuildMember,
	MessageFlags,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from "discord.js";
import type { AppContext } from "../../bot/context";
import { DISCORD_LIMITS, TIMEOUT } from "../../constants";
import {
	clearComponents,
	createCommandUserFilter,
	createDrawButtonRow,
	ROOM_ONLY_MESSAGE,
	replyError,
} from "../helpers";
import { getRoomFromVoiceAndTextChannel } from "../helpers/room";
import type { GuildCommandInteraction } from "../types";
import { createTeamSessionRow, formatTeams, startTeamSession, type Team } from "./session";

const NOT_ENOUGH_MEMBERS_MESSAGE = "チーム分けには2人以上のメンバーが必要です";

/**
 * /team random サブコマンド
 * メンバーをランダムにチームに分ける
 */
export async function handleRandom(
	interaction: GuildCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	// 決まったチームのセッションはルームごとに持つため、結果はそのルーム内のチャンネルに出す
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

	const createTeams = (): Team[] => {
		const members = candidates.filter((m: GuildMember) => !excludedIds.has(m.id));
		const teamCount = Math.max(2, Math.min(number, members.size));
		const shuffled = members.clone();
		const teams: Team[] = [];
		const baseSize = Math.floor(members.size / teamCount);
		const remainder = members.size % teamCount;

		for (let i = 0; i < teamCount; i++) {
			const size = baseSize + (i < remainder ? 1 : 0);
			const teamMembersArray = shuffled.random(size);
			const teamMembers: Team = new Collection();
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

	const buildDrawingRows = () => [buildExcludeRow(), actionRow];

	const excludedMembers = () => [
		...candidates.filter((m: GuildMember) => excludedIds.has(m.id)).values(),
	];

	const render = () => formatTeams(teams, excludedMembers());

	const message = await interaction.editReply({
		content: render(),
		components: buildDrawingRows(),
	});

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
						content: render(),
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
					content: render(),
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
				// 確定後は、決まったチームを操作するセッションがメッセージを引き継ぐ
				collector.stop("confirm");
				// 確定後に要るのは誰がどのチームかだけのため、除外の表示は外す
				startTeamSession({ message, room, teams, userId: interaction.user.id });
				await componentInteraction.update({
					content: formatTeams(teams),
					components: [createTeamSessionRow(teams.length)],
				});
				break;

			case "reroll":
				teams = createTeams();
				await componentInteraction.update({
					content: render(),
					components: buildDrawingRows(),
				});
				break;
		}
	});

	collector.on("end", async (_collected, reason) => {
		if (reason === "cancel" || reason === "confirm") return;
		await clearComponents(message);
	});
}
