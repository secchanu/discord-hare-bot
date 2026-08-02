import type { ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../../bot/context";
import { handleData } from "./data";

const mockGameManager = {
	getGame: vi.fn(),
};

const mockRoom = {
	game: { id: "game-role-id", name: "ゲームA", data: {} },
};

const mockRoomManager = {
	get: vi.fn(),
};

const mockCtx = {
	roomManager: mockRoomManager,
	gameManager: mockGameManager,
} as unknown as AppContext;

function makeSelectInteraction(key: string) {
	return {
		values: [key],
		deferUpdate: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined),
	};
}

function makeMessage(selectInteraction: ReturnType<typeof makeSelectInteraction> | null) {
	let collectHandler: ((interaction: unknown) => Promise<void>) | undefined;
	const mockCollector = {
		on: vi.fn((event: string, handler: (interaction: unknown) => Promise<void>) => {
			if (event === "collect") collectHandler = handler;
		}),
		stop: vi.fn(),
		getCollectHandler: () => collectHandler,
	};

	return {
		awaitMessageComponent: vi.fn().mockResolvedValue(selectInteraction),
		createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
		edit: vi.fn().mockResolvedValue(undefined),
		collector: mockCollector,
	};
}

function makeInteraction(message: ReturnType<typeof makeMessage>) {
	return {
		channel: { id: "text-channel-id", parentId: "category-id" },
		user: { id: "user-id" },
		deferReply: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockImplementation(async () => message),
		deleteReply: vi.fn().mockResolvedValue(undefined),
	} as unknown as ChatInputCommandInteraction;
}

describe("/rand data", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRoomManager.get.mockReturnValue(mockRoom);
	});

	it("ルーム外から実行した場合はエラーを返す", async () => {
		mockRoomManager.get.mockReturnValue(undefined);
		const message = makeMessage(null);
		const interaction = makeInteraction(message);
		await handleData(interaction, mockCtx);
		expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("ルーム内でのみ"));
	});

	it("ゲームが未設定の場合は「ゲームが設定されていません」を返す", async () => {
		mockGameManager.getGame.mockResolvedValue(null);
		const message = makeMessage(null);
		const interaction = makeInteraction(message);
		await handleData(interaction, mockCtx);
		expect(interaction.editReply).toHaveBeenCalledWith(
			expect.stringContaining("ゲームが設定されていません"),
		);
	});

	it("ゲームデータが空の場合は「抽選できるデータがありません」を返す", async () => {
		mockGameManager.getGame.mockResolvedValue({ id: "game-role-id", name: "ゲームA", data: {} });
		const message = makeMessage(null);
		const interaction = makeInteraction(message);
		await handleData(interaction, mockCtx);
		expect(interaction.editReply).toHaveBeenCalledWith(
			expect.stringContaining("抽選できるデータがありません"),
		);
	});

	it("セレクトメニューがタイムアウトした場合は「タイムアウト」メッセージを返す", async () => {
		mockGameManager.getGame.mockResolvedValue({
			id: "game-role-id",
			name: "ゲームA",
			data: { マップ: ["マップA", "マップB"] },
		});
		// awaitMessageComponent が null を返す（タイムアウト）
		const message = makeMessage(null);
		const interaction = makeInteraction(message);

		await handleData(interaction, mockCtx);
		expect(interaction.editReply).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: expect.stringContaining("タイムアウト") }),
		);
	});

	describe("UI状態分岐: reroll / confirm / cancel", () => {
		async function setupWithData() {
			mockGameManager.getGame.mockResolvedValue({
				id: "game-role-id",
				name: "ゲームA",
				data: { マップ: ["マップA", "マップB"] },
			});

			const selectInteraction = makeSelectInteraction("マップ");
			const message = makeMessage(selectInteraction);
			const interaction = makeInteraction(message);

			await handleData(interaction, mockCtx);

			return {
				interaction,
				selectInteraction,
				message,
				mockCollector: message.collector,
				getCollectHandler: () => message.collector.getCollectHandler(),
			};
		}

		it("reroll後: 新しいランダム値が表示される（同じボタン行）", async () => {
			const { getCollectHandler } = await setupWithData();
			const collectHandler = getCollectHandler();
			expect(collectHandler).toBeDefined();

			const buttonInteraction = {
				customId: "reroll",
				deferUpdate: vi.fn().mockResolvedValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
			};
			await collectHandler!(buttonInteraction);

			expect(buttonInteraction.update).toHaveBeenCalledWith(
				expect.objectContaining({ components: expect.any(Array) }),
			);
		});

		it("confirm後: ボタンが消える（コンテンツは残る）", async () => {
			const { mockCollector, getCollectHandler } = await setupWithData();
			const collectHandler = getCollectHandler();
			expect(collectHandler).toBeDefined();

			const buttonInteraction = {
				customId: "confirm",
				deferUpdate: vi.fn().mockResolvedValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
			};
			await collectHandler!(buttonInteraction);

			expect(mockCollector.stop).toHaveBeenCalledWith("confirm");
			expect(buttonInteraction.update).toHaveBeenCalledWith(
				expect.objectContaining({ components: [] }),
			);
		});

		it("cancel後: ボタン側のインタラクションでリプライが削除される", async () => {
			const { mockCollector, getCollectHandler } = await setupWithData();
			const collectHandler = getCollectHandler();
			expect(collectHandler).toBeDefined();

			const buttonInteraction = {
				customId: "cancel",
				deferUpdate: vi.fn().mockResolvedValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				// 元コマンドのトークンは15分で失効するため、削除はボタン側インタラクションで行う
				deleteReply: vi.fn().mockResolvedValue(undefined),
			};
			await collectHandler!(buttonInteraction);

			expect(mockCollector.stop).toHaveBeenCalledWith("cancel");
			expect(buttonInteraction.deleteReply).toHaveBeenCalled();
		});
	});
});
