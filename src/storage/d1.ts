import {SqlStorage} from './sql.js';

// The part of Cloudflare's D1 binding that the storage uses. wrangler applies
// the migrations to D1 itself, so there is nothing to migrate here.
export type D1Database = {
	prepare(sql: string): {
		bind(...values: unknown[]): {
			all<T>(): Promise<{results: T[]}>;
			first<T>(): Promise<T | null>;
			run(): Promise<{meta: {changes: number}}>;
		};
	};
};

// The hosted Instance's data, in D1.
export class D1Storage extends SqlStorage {
	constructor(d1: D1Database) {
		super({
			all: async (sql, ...values) => (await d1.prepare(sql).bind(...values).all<any>()).results,
			get: async (sql, ...values) => (await d1.prepare(sql).bind(...values).first<any>()) ?? undefined,
			run: async (sql, ...values) => (await d1.prepare(sql).bind(...values).run()).meta.changes,
		});
	}

	// D1 has no connection to close.
	close(): void {}
}
