import type { ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameManager } from "../../features/games/GameManager";
import { RoomManager } from "../../features/rooms/RoomManager";
import { handleData } from "./data";

vi.mock("../../features/games/GameManager", () => ({
	GameManager: {
		getInstance: vi.fn(),
	},
}));

vi.mock("../../features/rooms/RoomManager", () => ({
	RoomManager: {
		getInstance: vi.fn(),
	},
}));

const mockGameManager = {
	getGame: vi.fn(),
};

const mockRoom = {
	toData: vi.fn().mockReturnValue({ gameId: "game-role-id" }),
};

const mockRoomManager = {
	get: vi.fn(),
};

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
		vi.mocked(GameManager.getInstance).mockReturnValue(
			mockGameManager as unknown as GameManager,
		);
		vi.mocked(RoomManager.getInstance).mockReturnValue(
			mockRoomManager as unknown as RoomManager,
		);
		mockRoomManager.get.mockReturnValue(mockRoom);
	});

	it("ルーム外から実行した場合はエラーを返す", async () => {
		mockRoomManager.get.mockReturnValue(undefined);
		const message = makeMessage(null);
		const interaction = makeInteraction(message);
		await handleData(interaction);
		expect(interaction.editReply).toHaveBeenCalledWith(
			expect.stringContaining("ルーム内でのみ"),
		);
	});

	it("ゲームが未設定の場合は「ゲームが設定されていません」を返す", async () => {
		mockGameManager.getGame.mockResolvedValue(null);
		const message = makeMessage(null);
		const interaction = makeInteraction(message);
		await handleData(interaction);
		expect(interaction.editReply).toHaveBeenCalledWith(
			expect.stringContaining("ゲームが設定されていません"),
		);
	});

	it("ゲームデータが空の場合は「抽選できるデータがありません」を返す", async () => {
		mockGameManager.getGame.mockResolvedValue({ id: "game-role-id", name: "ゲームA", data: {} });
		const message = makeMessage(null);
		const interaction = makeInteraction(message);
		await handleData(interaction);
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
		const message = {
			awaitMessageComponent: vi.fn().mockResolvedValue(null),
			createMessageComponentCollector: vi.fn(),
		};
		const interaction = {
			channel: { id: "text-channel-id", parentId: "category-id" },
			user: { id: "user-id" },
			deferReply: vi.fn().mockResolvedValue(undefined),
			editReply: vi.fn().mockImplementation(async () => message),
			deleteReply: vi.fn().mockResolvedValue(undefined),
		} as unknown as ChatInputCommandInteraction;

		await handleData(interaction);
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

			let collectHandler: ((interaction: unknown) => Promise<void>) | undefined;
			const mockCollector = {
				on: vi.fn((event: string, handler: (interaction: unknown) => Promise<void>) => {
					if (event === "collect") collectHandler = handler;
				}),
				stop: vi.fn(),
			};

			const selectInteraction = makeSelectInteraction("マップ");
			const message = {
				awaitMessageComponent: vi.fn().mockResolvedValue(selectInteraction),
				createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
			};

			const interaction = {
				channel: { id: "text-channel-id", parentId: "category-id" },
				user: { id: "user-id" },
				deferReply: vi.fn().mockResolvedValue(undefined),
				editReply: vi.fn().mockImplementation(async () => message),
				deleteReply: vi.fn().mockResolvedValue(undefined),
			} as unknown as ChatInputCommandInteraction;

			const handlePromise = handleData(interaction);
			// handleData は非同期でコレクターを設定するため、Promise が解決するのを待つ
			await handlePromise;

			return {
				interaction,
				selectInteraction,
				mockCollector,
				getCollectHandler: () => collectHandler,
			};
		}

		it("reroll後: 新しいランダム値が表示される（同じボタン行）", async () => {
			const { selectInteraction, getCollectHandler } = await setupWithData();
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

			expect(mockCollector.stop).toHaveBeenCalled();
			expect(buttonInteraction.update).toHaveBeenCalledWith(
				expect.objectContaining({ components: [] }),
			);
		});

		it("cancel後: リプライが削除される", async () => {
			const { interaction, mockCollector, getCollectHandler } = await setupWithData();
			const collectHandler = getCollectHandler();
			expect(collectHandler).toBeDefined();

			const buttonInteraction = {
				customId: "cancel",
				deferUpdate: vi.fn().mockResolvedValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
			};
			await collectHandler!(buttonInteraction);

			expect(mockCollector.stop).toHaveBeenCalled();
			expect(interaction.deleteReply).toHaveBeenCalled();
		});
	});
});
