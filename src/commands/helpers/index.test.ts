import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { isGuildInteraction } from "./index";

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

	it("ギルド外かつチャンネルが null の場合は false を返す", () => {
		const interaction = {
			inCachedGuild: vi.fn().mockReturnValue(false),
			channel: null,
		} as unknown as ChatInputCommandInteraction;

		expect(isGuildInteraction(interaction)).toBe(false);
	});
});
