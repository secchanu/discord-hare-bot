import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseIgnoreRoles, validateConfig } from "./config";

describe("parseIgnoreRoles", () => {
	it("undefinedを渡した場合は空配列を返す", () => {
		expect(parseIgnoreRoles(undefined)).toEqual([]);
	});

	it("空文字列を渡した場合は空配列を返す", () => {
		expect(parseIgnoreRoles("")).toEqual([]);
	});

	it("単一の id:note 形式をパースする", () => {
		expect(parseIgnoreRoles("123456789:モデレーター")).toEqual([
			{ id: "123456789", note: "モデレーター" },
		]);
	});

	it("複数の id:note 形式をカンマ区切りでパースする", () => {
		expect(parseIgnoreRoles("111:管理者,222:モデレーター")).toEqual([
			{ id: "111", note: "管理者" },
			{ id: "222", note: "モデレーター" },
		]);
	});

	it("コロンがない場合はnoteが空文字になる", () => {
		expect(parseIgnoreRoles("123456789")).toEqual([
			{ id: "123456789", note: "" },
		]);
	});

	it("id の前後の空白を除去する", () => {
		expect(parseIgnoreRoles(" 123 :ノート")).toEqual([
			{ id: "123", note: "ノート" },
		]);
	});

	it("note の前後の空白を除去する", () => {
		expect(parseIgnoreRoles("123: ノート ")).toEqual([
			{ id: "123", note: "ノート" },
		]);
	});

	it("IDが空の項目は除外される", () => {
		expect(parseIgnoreRoles(":ノート,123:有効")).toEqual([
			{ id: "123", note: "有効" },
		]);
	});

	it("noteにコロンが含まれる場合、最初のコロンで分割される", () => {
		expect(parseIgnoreRoles("123:ノート:追記")).toEqual([
			{ id: "123", note: "ノート:追記" },
		]);
	});
});

describe("validateConfig", () => {
	// biome-ignore lint/suspicious/noExplicitAny: spyOnの戻り型を統一するためanyを使用
	let exitSpy: any;
	// biome-ignore lint/suspicious/noExplicitAny: spyOnの戻り型を統一するためanyを使用
	let consoleErrorSpy: any;

	beforeEach(() => {
		// process.exit をモックしてテスト中断を防ぐ
		exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((_code?: string | number | null) => {
				throw new Error(`process.exit called with code ${_code}`);
			});
		consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
	});

	afterEach(() => {
		exitSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	it("全必須フィールドが揃っている場合はエラーなし", () => {
		const config = {
			botToken: "token",
			readyChannelId: "111",
			wantedChannelId: "222",
			ignoreRoleIds: [],
			ignoreRoles: [],
		};
		expect(() => validateConfig(config)).not.toThrow();
	});

	it("botTokenが空の場合はprocess.exitが呼ばれる", () => {
		const config = {
			botToken: "",
			readyChannelId: "111",
			wantedChannelId: "222",
			ignoreRoleIds: [],
			ignoreRoles: [],
		};
		expect(() => validateConfig(config)).toThrow("process.exit called with code 1");
	});

	it("readyChannelIdが空の場合はprocess.exitが呼ばれる", () => {
		const config = {
			botToken: "token",
			readyChannelId: "",
			wantedChannelId: "222",
			ignoreRoleIds: [],
			ignoreRoles: [],
		};
		expect(() => validateConfig(config)).toThrow("process.exit called with code 1");
	});

	it("wantedChannelIdが空の場合はprocess.exitが呼ばれる", () => {
		const config = {
			botToken: "token",
			readyChannelId: "111",
			wantedChannelId: "",
			ignoreRoleIds: [],
			ignoreRoles: [],
		};
		expect(() => validateConfig(config)).toThrow("process.exit called with code 1");
	});

	it("複数フィールドが空の場合もprocess.exitが呼ばれる", () => {
		const config = {
			botToken: "",
			readyChannelId: "",
			wantedChannelId: "",
			ignoreRoleIds: [],
			ignoreRoles: [],
		};
		expect(() => validateConfig(config)).toThrow("process.exit called with code 1");
	});
});
