import type { AppContext } from "../../bot/context";
import { ROOM_ONLY_MESSAGE, replyError } from "../helpers";
import { getRoomFromVoiceAndTextChannel } from "../helpers/room";
import type { GuildCommandInteraction } from "../types";
import { createTeamSessionRow, formatTeams, startTeamSession } from "./session";

const NOT_SPLIT_MESSAGE = "2つ以上の追加VCにメンバーが分かれている必要があります";

/**
 * /team current サブコマンド
 * 追加ボイスチャンネルに分かれている今のメンバーを、そのままチームにする
 * /team random 以外（サイトのチーム分けやゲーム内の抽選など）で決めたチームも、/team random で決めたチームと同じく扱えるようにする
 */
export async function handleCurrent(
	interaction: GuildCommandInteraction,
	ctx: AppContext,
): Promise<void> {
	const room = getRoomFromVoiceAndTextChannel(interaction, ctx.roomManager);
	if (!room) {
		await replyError(interaction, ROOM_ONLY_MESSAGE);
		return;
	}

	// 追加ボイスチャンネルの番号をチームの番号にする。メインのボイスチャンネルにいるメンバーは観戦として含めない
	// 途中の空のボイスチャンネルは、番号をずらさないよう空のチームとして残し、末尾の空のボイスチャンネルは数えない
	const teams = Array.from({ length: room.additionalVoiceChannelCount }, (_, i) =>
		room.membersIn(i + 1),
	);
	while (teams.length && !teams.at(-1)?.size) teams.pop();
	if (teams.filter((members) => members.size).length < 2) {
		await replyError(interaction, NOT_SPLIT_MESSAGE);
		return;
	}

	await interaction.deferReply();
	const message = await interaction.editReply({
		content: formatTeams(teams),
		components: [createTeamSessionRow(teams.length)],
	});

	startTeamSession({ message, room, teams, userId: interaction.user.id });
}
