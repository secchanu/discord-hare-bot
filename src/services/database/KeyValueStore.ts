import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * SQLite ベースのキーバリューストア
 * 値は JSON シリアライズされるため、型が保てない値は呼び出し側で変換する
 */
export class KeyValueStore<T> {
	private db: DatabaseSync;

	constructor(filename: string) {
		const dbPath = resolve(process.cwd(), "sqlite", filename);
		mkdirSync(dirname(dbPath), { recursive: true });

		this.db = new DatabaseSync(dbPath);
		this.db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
		console.log(`[Database] Opened: ${dbPath}`);
	}

	get(key: string): T | undefined {
		const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as
			| { value: string }
			| undefined;
		return row === undefined ? undefined : (JSON.parse(row.value) as T);
	}

	set(key: string, value: T): void {
		this.db
			.prepare(
				"INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			)
			.run(key, JSON.stringify(value));
	}

	delete(key: string): void {
		this.db.prepare("DELETE FROM kv WHERE key = ?").run(key);
	}

	getAll(): T[] {
		const rows = this.db.prepare("SELECT value FROM kv").all() as { value: string }[];
		return rows.map((row) => JSON.parse(row.value) as T);
	}
}
