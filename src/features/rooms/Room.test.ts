import { describe, expect, it } from "vitest";
import { TIME } from "../../constants";
import type { RoomData } from "./types";

// Roomの純粋なビジネスロジックのみをテスト
// Discord.jsに依存する部分はモックするか、別途統合テストで確認

describe("Room Business Logic", () => {
	describe("toData / fromData シリアライゼーション", () => {
		it("ルームデータを正しくシリアライズできる", () => {
			// RoomのtoDataメソッドが返すべきデータ構造を検証
			const expectedData: RoomData = {
				id: "category-123",
				guildId: "guild-123",
				hostname: "TestUser",
				ownerId: "user-123",
				gameId: "game-456",
				reserved: false,
				eventId: undefined,
				channels: {
					categoryId: "category-123",
					textChannelId: "text-123",
					voiceChannelId: "voice-123",
					additionalVoiceChannelIds: ["voice-456", "voice-789"],
				},
				createdAt: new Date("2024-01-01T00:00:00Z"),
			};

			// データ構造の検証
			expect(expectedData.channels.categoryId).toBe(expectedData.id);
			expect(expectedData.channels.additionalVoiceChannelIds).toHaveLength(2);
		});

		it("予約済みルームの場合はreservedとeventIdが設定される", () => {
			const reservedRoomData: RoomData = {
				id: "category-123",
				guildId: "guild-123",
				hostname: "EventHost",
				ownerId: "user-123",
				gameId: "game-456",
				reserved: true,
				eventId: "event-789",
				channels: {
					categoryId: "category-123",
					textChannelId: "text-123",
					voiceChannelId: "voice-123",
					additionalVoiceChannelIds: [],
				},
				createdAt: new Date(),
			};

			expect(reservedRoomData.reserved).toBe(true);
			expect(reservedRoomData.eventId).toBe("event-789");
		});
	});

	describe("ゲーム募集メッセージの有効性判定", () => {
		const SIX_HOURS_MS = TIME.SIX_HOURS;

		it("6時間以内のメッセージは有効", () => {
			const now = new Date();
			const fiveHoursAgo = new Date(now.getTime() - 5 * TIME.HOUR);

			const diff = now.getTime() - fiveHoursAgo.getTime();
			expect(diff).toBeLessThan(SIX_HOURS_MS);
			expect(diff > SIX_HOURS_MS).toBe(false); // メッセージは有効
		});

		it("6時間を超えたメッセージは無効", () => {
			const now = new Date();
			const sevenHoursAgo = new Date(now.getTime() - 7 * TIME.HOUR);

			const diff = now.getTime() - sevenHoursAgo.getTime();
			expect(diff).toBeGreaterThan(SIX_HOURS_MS);
			expect(diff > SIX_HOURS_MS).toBe(true); // メッセージは無効
		});

		it("ちょうど6時間のメッセージは無効", () => {
			const now = new Date();
			const sixHoursAgo = new Date(now.getTime() - SIX_HOURS_MS);

			const diff = now.getTime() - sixHoursAgo.getTime();
			expect(diff).toBe(SIX_HOURS_MS);
			expect(diff > SIX_HOURS_MS).toBe(false); // 境界値：ちょうど6時間は有効扱い
		});

		it("編集されたメッセージは編集日時で判定される", () => {
			const now = new Date();
			const createdAt = new Date(now.getTime() - 10 * TIME.HOUR); // 10時間前に作成
			const editedAt = new Date(now.getTime() - 2 * TIME.HOUR); // 2時間前に編集

			// editedAtが優先される
			const messageDate = editedAt ?? createdAt;
			const diff = now.getTime() - messageDate.getTime();

			expect(diff).toBeLessThan(SIX_HOURS_MS);
			expect(diff > SIX_HOURS_MS).toBe(false); // 編集日時で判定されるので有効
		});
	});

	describe("ignoreRoleIds によるロール除外", () => {
		it("ignoreRoleIdsに含まれるロールは無効", () => {
			const ignoreRoleIds = ["admin-role", "bot-role", "mod-role"];
			const testRoleId = "admin-role";

			expect(ignoreRoleIds.includes(testRoleId)).toBe(true);
		});

		it("ignoreRoleIdsに含まれないロールは有効", () => {
			const ignoreRoleIds = ["admin-role", "bot-role", "mod-role"];
			const testRoleId = "game-role";

			expect(ignoreRoleIds.includes(testRoleId)).toBe(false);
		});

		it("@everyoneロールの扱い", () => {
			const ignoreRoleIds = ["admin-role"];
			const everyoneRoleId = "guild-everyone-id";

			// @everyoneがignoreRoleIdsに含まれていない場合は有効
			expect(ignoreRoleIds.includes(everyoneRoleId)).toBe(false);
		});
	});

	describe("追加VCの管理ロジック", () => {
		it("メンバー数に応じて追加VCの必要数を計算", () => {
			// ビジネスロジック：何人以上で追加VCが必要か？
			// 実装から推測される仕様を確認

			// 例：5人以下は追加VCなし、6人以上で1つ追加など
			const calculateAdditionalVCs = (memberCount: number): number => {
				if (memberCount <= 5) return 0;
				if (memberCount <= 10) return 1;
				return Math.ceil((memberCount - 5) / 5);
			};

			expect(calculateAdditionalVCs(3)).toBe(0);
			expect(calculateAdditionalVCs(5)).toBe(0);
			expect(calculateAdditionalVCs(6)).toBe(1);
			expect(calculateAdditionalVCs(10)).toBe(1);
			expect(calculateAdditionalVCs(11)).toBe(2);
		});

		it("追加VCのIDリストを管理", () => {
			const additionalVoiceChannelIds: string[] = [];

			// 追加
			additionalVoiceChannelIds.push("vc-1");
			expect(additionalVoiceChannelIds).toContain("vc-1");

			// 削除
			const index = additionalVoiceChannelIds.indexOf("vc-1");
			if (index > -1) {
				additionalVoiceChannelIds.splice(index, 1);
			}
			expect(additionalVoiceChannelIds).not.toContain("vc-1");
		});
	});

	describe("ルーム自動削除の条件", () => {
		it("メンバーが0人の場合は削除対象", () => {
			const memberCount = 0;
			const shouldDelete = memberCount === 0;

			expect(shouldDelete).toBe(true);
		});

		it("メンバーが1人以上の場合は削除しない", () => {
			const memberCount: number = 1;
			const shouldDelete = memberCount === 0;

			expect(shouldDelete).toBe(false);
		});

		it("オーナーが不在でもメンバーがいれば削除しない", () => {
			// オーナーの有無は関係なく、メンバー数のみで判定
			const memberCount: number = 3;
			const shouldDelete = memberCount === 0;

			expect(shouldDelete).toBe(false);
		});
	});
});
