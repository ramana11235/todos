import {readdirSync, readFileSync} from 'node:fs';
import {DatabaseSync, type SQLInputValue} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {SqlStorage} from './sql.js';

// The migrations folder sits at the top of the repo, two levels above this
// file whether it runs from src or from dist.
const migrationsFolder = fileURLToPath(new URL('../../migrations/', import.meta.url));

// Each file moves the schema up one version, in name order. Never edit a file
// once it has shipped; add a new one instead. D1 applies the same files.
export const migrations = (): string[] =>
	readdirSync(migrationsFolder)
		.filter(name => name.endsWith('.sql'))
		.sort()
		.map(name => readFileSync(migrationsFolder + name, 'utf8'));

// The local SQLite file, which a laptop's Instance keeps its data in.
export class SqliteStorage extends SqlStorage {
	private readonly file: DatabaseSync;

	constructor(path: string) {
		const file = new DatabaseSync(path);
		const params = (values: unknown[]) => values as SQLInputValue[];
		super({
			all: async (sql, ...values) => file.prepare(sql).all(...params(values)) as any[],
			get: async (sql, ...values) => file.prepare(sql).get(...params(values)) as any,
			run: async (sql, ...values) => Number(file.prepare(sql).run(...params(values)).changes),
		});
		this.file = file;
		file.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
		this.migrate();
	}

	close(): void {
		this.file.close();
	}

	// The file's user_version counts the migrations already applied.
	private migrate(): void {
		const all = migrations();
		const {user_version: version} = this.file.prepare('PRAGMA user_version').get() as {user_version: number};
		for (let next = version; next < all.length; next++) {
			this.file.exec('BEGIN');
			this.file.exec(all[next]!);
			this.file.exec(`PRAGMA user_version = ${next + 1}`);
			this.file.exec('COMMIT');
		}
	}
}
