import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import KeyvSqlite from "@keyv/sqlite";
import Keyv from "keyv";

/**
 * Keyv インスタンスの作成ヘルパー
 * SQLite データベースへの接続を提供
 */
export function createKeyvStore<T>(filename: string): Keyv<T> {
	try {
		// データベースファイルの絶対パスを決定
		const dbPath = resolve(process.cwd(), "sqlite", filename);
		const dbDir = dirname(dbPath);

		// ディレクトリが存在しない場合は作成
		// recursive: true により並行実行時の競合状態も安全に処理される
		if (!existsSync(dbDir)) {
			try {
				mkdirSync(dbDir, { recursive: true });
				console.log(`[Database] Created directory: ${dbDir}`);
			} catch (dirError) {
				// ディレクトリ作成が失敗した場合でも、既に存在する場合は続行
				if (!existsSync(dbDir)) {
					throw new Error(`Failed to create database directory: ${dirError}`);
				}
			}
		}

		const sqliteUri = `sqlite://${dbPath}`;
		console.log(`[Database] Connecting to: ${sqliteUri}`);

		const keyvSqlite = new KeyvSqlite(sqliteUri);
		return new Keyv<T>(keyvSqlite);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(
			`[Database] Failed to create Keyv store for ${filename}: ${errorMessage}`,
		);
		console.error(
			"[Database] Ensure the application has write permissions and sufficient disk space",
		);
		throw error;
	}
}
