import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseIgnoreRoles, validateConfig } from "./config";

describe("config", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		// 環境変数を保存
		originalEnv = { ...process.env };

		// console.errorとprocess.exitをモック
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(process, "exit").mockImplementation((code) => {
			throw new Error(`Process exited with code ${code}`);
		});
	});

	afterEach(() => {
		// 環境変数を復元
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	describe("parseIgnoreRoles", () => {
		it("正しいフォーマットの文字列をパースする", () => {
			const input = "123:Admin,456:Bot Role,789:Mod";

			const result = parseIgnoreRoles(input);

			expect(result).toEqual([
				{ id: "123", note: "Admin" },
				{ id: "456", note: "Bot Role" },
				{ id: "789", note: "Mod" },
			]);
		});

		it("noteがない場合は空文字列を設定する", () => {
			const input = "123,456:Bot,789";

			const result = parseIgnoreRoles(input);

			expect(result).toEqual([
				{ id: "123", note: "" },
				{ id: "456", note: "Bot" },
				{ id: "789", note: "" },
			]);
		});

		it("空のIDは除外される", () => {
			const input = "123:Admin,:Bot,456:,,:,789";

			const result = parseIgnoreRoles(input);

			expect(result).toEqual([
				{ id: "123", note: "Admin" },
				{ id: "456", note: "" },
				{ id: "789", note: "" },
			]);
		});

		it("前後の空白を削除する", () => {
			const input = " 123 : Admin Role ,  456:Bot  ";

			const result = parseIgnoreRoles(input);

			expect(result).toEqual([
				{ id: "123", note: "Admin Role" },
				{ id: "456", note: "Bot" },
			]);
		});

		it("undefinedの場合は空配列を返す", () => {
			const result = parseIgnoreRoles(undefined);

			expect(result).toEqual([]);
		});

		it("空文字列の場合は空配列を返す", () => {
			const result = parseIgnoreRoles("");

			expect(result).toEqual([]);
		});

		it("コロンが複数ある場合は最初のコロンで分割する", () => {
			const input = "123:Admin:With:Colons";

			const result = parseIgnoreRoles(input);

			expect(result).toEqual([{ id: "123", note: "Admin:With:Colons" }]);
		});
	});

	describe("validateConfig", () => {
		it("すべての必須フィールドがある場合はエラーにならない", () => {
			const validConfig = {
				botToken: "token",
				readyChannelId: "123",
				wantedChannelId: "456",
				ignoreRoleIds: [],
				ignoreRoles: [],
			};

			expect(() => validateConfig(validConfig)).not.toThrow();
			expect(console.error).not.toHaveBeenCalled();
		});

		it("botTokenがない場合はエラーを出力して終了する", () => {
			const invalidConfig = {
				botToken: "",
				readyChannelId: "123",
				wantedChannelId: "456",
				ignoreRoleIds: [],
				ignoreRoles: [],
			};

			expect(() => validateConfig(invalidConfig)).toThrow(
				"Process exited with code 1",
			);
			expect(console.error).toHaveBeenCalledWith("Configuration errors:");
			expect(console.error).toHaveBeenCalledWith(
				"  - DISCORD_BOT_TOKEN is required",
			);
		});

		it("readyChannelIdがない場合はエラーを出力して終了する", () => {
			const invalidConfig = {
				botToken: "token",
				readyChannelId: "",
				wantedChannelId: "456",
				ignoreRoleIds: [],
				ignoreRoles: [],
			};

			expect(() => validateConfig(invalidConfig)).toThrow(
				"Process exited with code 1",
			);
			expect(console.error).toHaveBeenCalledWith(
				"  - DISCORD_READY_CHANNEL_ID is required",
			);
		});

		it("wantedChannelIdがない場合はエラーを出力して終了する", () => {
			const invalidConfig = {
				botToken: "token",
				readyChannelId: "123",
				wantedChannelId: "",
				ignoreRoleIds: [],
				ignoreRoles: [],
			};

			expect(() => validateConfig(invalidConfig)).toThrow(
				"Process exited with code 1",
			);
			expect(console.error).toHaveBeenCalledWith(
				"  - DISCORD_WANTED_CHANNEL_ID is required",
			);
		});

		it("複数のエラーがある場合はすべて出力する", () => {
			const invalidConfig = {
				botToken: "",
				readyChannelId: "",
				wantedChannelId: "",
				ignoreRoleIds: [],
				ignoreRoles: [],
			};

			expect(() => validateConfig(invalidConfig)).toThrow(
				"Process exited with code 1",
			);
			expect(console.error).toHaveBeenCalledWith("Configuration errors:");
			expect(console.error).toHaveBeenCalledWith(
				"  - DISCORD_BOT_TOKEN is required",
			);
			expect(console.error).toHaveBeenCalledWith(
				"  - DISCORD_READY_CHANNEL_ID is required",
			);
			expect(console.error).toHaveBeenCalledWith(
				"  - DISCORD_WANTED_CHANNEL_ID is required",
			);
			expect(console.error).toHaveBeenCalledWith(
				"\nPlease check your environment variables or .env file",
			);
		});
	});
});
