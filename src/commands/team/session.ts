import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type Collection,
	type GuildMember,
	type Message,
	type MessageComponentInteraction,
	MessageFlags,
	type Snowflake,
} from "discord.js";
import type { Room } from "../../features/rooms/Room";
import { clearComponents, createCommandUserFilter, MOVE_FAILED_MESSAGE } from "../helpers";
import { replaceSession } from "../helpers/session";

/**
 * チームのメンバー
 * チームの並びの番号が、移動先の追加ボイスチャンネルの番号になる
 */
export type Team = Collection<Snowflake, GuildMember>;

/**
 * チームの一覧を表示する文字列にする
 * 除外したメンバーがいれば、一覧の後ろに並べる
 */
export function formatTeams(teams: Team[], excluded: GuildMember[] = []): string {
	const teamList = teams
		.map((members, i) => {
			const memberList = members.size ? members.map((m) => m.toString()).join("\n") : "なし";
			return `チーム${i + 1}\n${memberList}`;
		})
		.join("\n\n");
	if (excluded.length === 0) return teamList;
	return `${teamList}\n\n除外: ${excluded.map((m) => m.toString()).join(" ")}`;
}

/**
 * 決まったチームを操作するボタンの行を作る
 * サイド交代は、2つのチームの移動先を入れ替える操作のため、2チームのときだけ置く
 */
export function createTeamSessionRow(teamCount: number): ActionRowBuilder<ButtonBuilder> {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("move").setLabel("チーム移動").setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId("gather").setLabel("全員集合").setStyle(ButtonStyle.Primary),
	);
	if (teamCount === 2) {
		row.addComponents(
			new ButtonBuilder()
				.setCustomId("swap")
				.setLabel("サイド交代")
				.setStyle(ButtonStyle.Secondary),
		);
	}
	return row;
}

/**
 * 決まったチームを操作するセッションを始める
 * 同じチームで試合を繰り返すため、そのルームで新しくチームが決まるか、ルームの削除でメッセージが消えるまで残す
 * 新しくチームが決まったら、どのチームで動かすか迷わないよう、前のセッションのボタンを取り除く
 * メッセージには、チームの一覧と createTeamSessionRow() の行を表示しておく
 */
export function startTeamSession(options: {
	message: Message;
	room: Room;
	teams: Team[];
	userId: Snowflake;
}): void {
	const { message, room } = options;
	let teams = options.teams;

	const collector = message.createMessageComponentCollector({
		filter: createCommandUserFilter(options.userId),
	});
	replaceSession(room, "team", collector);
	collector.on("end", async () => {
		await clearComponents(message);
	});

	const reportFailure = async (interaction: MessageComponentInteraction, succeeded: boolean) => {
		// ボタンは同じチームでの再操作に使うため残し、失敗は操作した人にだけ伝える
		if (succeeded) return;
		await interaction.followUp({ content: MOVE_FAILED_MESSAGE, flags: MessageFlags.Ephemeral });
	};

	// 各チームを番号の同じ追加ボイスチャンネルへ移動する
	// ルームのボイスチャンネルを抜けた人はルームを離れたとみなし、動かさない
	const moveTeams = async (): Promise<boolean> => {
		if (room.additionalVoiceChannelCount < teams.length) {
			await room.setAdditionalVoiceChannels(teams.length);
		}
		const inRoom = room.members;
		const results = await Promise.all(
			teams.flatMap((members, index) =>
				members
					.filter((member) => inRoom.has(member.id))
					.map((member) => room.moveMembers(member.voice, index + 1)),
			),
		);
		return results.every(Boolean);
	};

	collector.on("collect", async (interaction) => {
		switch (interaction.customId) {
			case "move": {
				await interaction.deferUpdate();
				await reportFailure(interaction, await moveTeams());
				break;
			}

			case "gather": {
				await interaction.deferUpdate();
				await reportFailure(interaction, await room.callMembers(0));
				break;
			}

			case "swap": {
				// 控えめなボタンのため、押し間違えても誰も動かないよう、移動はチーム移動に任せる
				teams = [...teams].reverse();
				await interaction.update({ content: formatTeams(teams) });
				break;
			}
		}
	});
}
