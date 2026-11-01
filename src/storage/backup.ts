// Copies the SQLite file into a folder, such as one a cloud drive syncs.
// The live file is never synced itself: in WAL mode recent writes sit in
// a second file, and a sync tool can copy the two at different moments.
// VACUUM INTO makes one whole, consistent file, even while todos runs.

import {spawnSync} from 'node:child_process';
import {mkdirSync, readdirSync, renameSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';

export const keptBackups = 30;

// Writes todos-YYYY-MM-DD.db, replacing one from earlier the same day,
// and keeps only the newest `keptBackups`. Returns the path written.
export function backup(databasePath: string, folder: string, now = new Date()): string {
	return write(folder, `todos-${day(now)}.db`, partial => {
		const db = new DatabaseSync(databasePath, {readOnly: true});
		try {
			db.prepare('VACUUM INTO ?').run(partial);
		} finally {
			db.close();
		}
	});
}

// The hosted Instance's data lives in D1, so its backup is D1's own export:
// the SQL that rebuilds it, written to todos-YYYY-MM-DD.sql. `exportTo`
// writes that SQL to a path; tests give their own.
export function backupHosted(folder: string, now = new Date(), exportTo = wranglerExport): string {
	return write(folder, `todos-${day(now)}.sql`, exportTo);
}

function write(folder: string, name: string, writeTo: (path: string) => void): string {
	mkdirSync(folder, {recursive: true});
	const path = join(folder, name);
	const partial = `${path}.partial`;
	rmSync(partial, {force: true});
	writeTo(partial);
	renameSync(partial, path);
	const old = readdirSync(folder)
		.filter(file => /^todos-\d{4}-\d{2}-\d{2}\.(db|sql)$/.test(file))
		.sort()
		.slice(0, -keptBackups);
	for (const file of old) rmSync(join(folder, file));
	return path;
}

// wrangler and its config sit in the repo this todos is built in, two
// levels above this file, and it uses the laptop's wrangler login.
// A daily run finds the login expired, and the first call straight after
// wrangler renews it can be refused, so a failed export is tried once more.
function wranglerExport(path: string): void {
	const repo = fileURLToPath(new URL('../../', import.meta.url));
	const run = () =>
		spawnSync(
			process.execPath,
			[join(repo, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'export', 'todos', '--remote', '--output', path],
			{cwd: repo, encoding: 'utf8'},
		);
	let result = run();
	if (result.status !== 0) result = run();
	if (result.status !== 0) throw new Error(`wrangler could not export the hosted data: ${result.stderr || result.stdout}`);
}

function day(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
