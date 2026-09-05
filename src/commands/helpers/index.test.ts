import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { createCommandUserFilter, isGuildInteraction } from "./index";

describe("createCommandUserFilter", () => {
	it("コマンド実行者の操作は通す", async () => {
		const componentInteraction = {
			user: { id: "user-1" },
			reply: vi.fn(),
		} as unknown as MessageComponentInteraction;

		await expect(createCommandUserFilter("user-1")(componentInteraction)).resolves.toBe(true);
		expect(componentInteraction.reply).not.toHaveBeenCalled();
	});

	it("実行者以外の操作は弾き、操作者にエフェメラル返信する", async () => {
		const componentInteraction = {
			user: { id: "user-2" },
			reply: vi.fn().mockResolvedValue(undefined),
		} as unknown as MessageComponentInteraction;

		await expect(createCommandUserFilter("user-1")(componentInteraction)).resolves.toBe(false);
		expect(componentInteraction.reply).toHaveBeenCalledWith(
			expect.objectContaining({ flags: MessageFlags.Ephemeral }),
		);
	});

	it("返信に失敗した場合も弾く", async () => {
		const componentInteraction = {
			user: { id: "user-2" },
			reply: vi.fn().mockRejectedValue(new Error("Unknown interaction")),
		} as unknown as MessageComponentInteraction;

		await expect(createCommandUserFilter("user-1")(componentInteraction)).resolves.toBe(false);
	});
});

describe("isGuildInteraction", () => {
	it("ギルド内かつチャンネルが非nullの場合は true を返す", () => {
		const interaction = {
			inCachedGuild: vi.fn().mockReturnValue(true),
			channel: { id: "channel-id" },
		} as unknown as ChatInputCommandInteraction;

		expect(isGuildInteraction(interaction)).toBe(true);
	});

	it("ギルド外の場合は false を返す", () => {
		const interaction = {
			inCachedGuild: vi.fn().mockReturnValue(false),
			channel: { id: "channel-id" },
		} as unknown as ChatInputCommandInteraction;

		expect(isGuildInteraction(interaction)).toBe(false);
	});

	it("チャンネルが null の場合は false を返す", () => {
		const interaction = {
			inCachedGuild: vi.fn().mockReturnValue(true),
			channel: null,
		} as unknown as ChatInputCommandInteraction;

		expect(isGuildInteraction(interaction)).toBe(false);
	});
});
