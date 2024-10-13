import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Collection,
	ComponentType,
	type GuildMember,
	SlashCommandBuilder,
} from "discord.js";
import { isGuildInteraction } from "./helpers";
import { getRoomFromVoiceChannel } from "./helpers/room";
import type { CommandHandler } from "./types";

/**
 * /team コマンド
 * メンバーをチームに分ける
 */
export const teamCommand: CommandHandler = {
	data: new SlashCommandBuilder()
		.setName("team")
		.setDescription("メンバーをチームに分ける")
		.addIntegerOption((option) =>
			option
				.setName("number")
				.setDescription("チーム数（指定無しの場合2チーム）")
				.setMinValue(2),
		),

	async execute(interaction) {
		if (!isGuildInteraction(interaction)) {
			await interaction.reply({
				content: "このコマンドはサーバー内でのみ使用できます。",
				ephemeral: true,
			});
			return;
		}

		await interaction.deferReply();

		const room = getRoomFromVoiceChannel(interaction);
		if (!room) {
			await interaction.editReply("このコマンドはルーム内でのみ使用できます。");
			return;
		}

		const channel = interaction.member.voice.channel;
		if (!channel) {
			await interaction.editReply(
				"このコマンドはルーム内のボイスチャンネルでのみ使用できます。",
			);
			return;
		}

		const number = interaction.options.getInteger("number") ?? 2;
		const members = channel.members.filter((m: GuildMember) => !m.user.bot);
		const teamCount = Math.max(2, Math.min(number, members.size));

		// チーム分け関数
		const createTeams = (): Collection<string, GuildMember>[] => {
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

		// ボタンコンポーネント
		const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("cancel")
				.setLabel("キャンセル")
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId("confirm")
				.setLabel("確定")
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId("reroll")
				.setLabel("再抽選")
				.setStyle(ButtonStyle.Primary),
		);

		const moveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("move")
				.setLabel("移動")
				.setStyle(ButtonStyle.Primary),
		);

		// チーム表示
		const formatTeams = () =>
			teams
				.map((members, i) => {
					const memberList = members
						.map((m: GuildMember) => m.toString())
						.join("\n");
					return `チーム${i + 1}\n${memberList}`;
				})
				.join("\n\n");

		const message = await interaction.editReply({
			content: formatTeams(),
			components: [actionRow],
		});

		const collector = message.createMessageComponentCollector({
			componentType: ComponentType.Button,
			filter: (i) =>
				i.user.id === interaction.user.id &&
				["cancel", "confirm", "reroll", "move"].includes(i.customId),
		});

		collector.on("collect", async (buttonInteraction) => {
			switch (buttonInteraction.customId) {
				case "cancel":
					collector.stop();
					await buttonInteraction.deferUpdate();
					await interaction.deleteReply();
					break;

				case "confirm":
					await buttonInteraction.update({ components: [moveRow] });
					break;

				case "reroll":
					teams = createTeams();
					await buttonInteraction.update({
						content: formatTeams(),
						components: [actionRow],
					});
					break;

				case "move": {
					await buttonInteraction.deferUpdate();

					// 必要なVCを確保（チーム数と同じ数の追加VCが必要）
					const currentVcCount =
						room.toData().channels.additionalVoiceChannelIds.length;
					if (currentVcCount < teamCount) {
						await room.setAdditionalVoiceChannels(teamCount);
					}

					// チームごとに移動（すべてのチームを追加VCに移動）
					const movePromises = teams.flatMap((teamMembers, index) =>
						teamMembers.map((member) =>
							room.moveMembers(member.voice, index + 1),
						),
					);

					await Promise.all(movePromises);
					await buttonInteraction.editReply({
						content: "チーム分けが完了しました",
						components: [],
					});
					collector.stop();
					break;
				}
			}
		});
	},
};
