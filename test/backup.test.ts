import {mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {Threads} from '../src/core/threads.js';
import {backup, backupHosted, keptBackups} from '../src/storage/backup.js';
import {SqliteStorage} from '../src/storage/sqlite.js';

function setUp() {
	const dir = mkdtempSync(join(tmpdir(), 'todos-backup-'));
	const path = join(dir, 'todos.db');
	const storage = new SqliteStorage(path);
	return {path, storage, threads: new Threads(storage), folder: join(dir, 'backups')};
}

describe('backing up', () => {
	it('copies every Thread into a dated file while todos is running', async () => {
		const {path, storage, threads, folder} = setUp();
		await threads.create({title: 'Move house'});
		const written = backup(path, folder, new Date(2026, 9, 18, 9));
		expect(written).toBe(join(folder, 'todos-2026-10-18.db'));
		const copy = new SqliteStorage(written);
		expect((await copy.listThreads()).map(t => t.title)).toEqual(['Move house']);
		copy.close();
		storage.close();
	});

	it('replaces a backup from earlier the same day', async () => {
		const {path, storage, threads, folder} = setUp();
		backup(path, folder, new Date(2026, 9, 18, 9));
		await threads.create({title: 'Move house'});
		const written = backup(path, folder, new Date(2026, 9, 18, 17));
		expect(readdirSync(folder)).toEqual(['todos-2026-10-18.db']);
		const copy = new SqliteStorage(written);
		expect(await copy.listThreads()).toHaveLength(1);
		copy.close();
		storage.close();
	});

	it(`keeps only the newest ${keptBackups} and leaves other files alone`, () => {
		const {path, storage, folder} = setUp();
		backup(path, folder, new Date(2025, 11, 31));
		for (let day = 1; day <= keptBackups; day++) backup(path, folder, new Date(2026, 0, day));
		writeFileSync(join(folder, 'notes.txt'), '');
		backup(path, folder, new Date(2026, 0, 31));
		const files = readdirSync(folder);
		expect(files).toHaveLength(keptBackups + 1);
		expect(files).not.toContain('todos-2025-12-31.db');
		expect(files).not.toContain('todos-2026-01-01.db');
		expect(files).toContain('notes.txt');
		storage.close();
	});
});

describe('backing up the hosted Instance', () => {
	it('writes its export into a dated file, keeping the newest alongside older local backups', () => {
		const folder = mkdtempSync(join(tmpdir(), 'todos-backup-'));
		for (let i = 1; i <= keptBackups; i++) writeFileSync(join(folder, `todos-2026-09-${String(i).padStart(2, '0')}.db`), '');
		const written = backupHosted(folder, new Date(2026, 9, 25, 12), path => writeFileSync(path, 'INSERT INTO threads VALUES (1);'));
		expect(written).toBe(join(folder, 'todos-2026-10-25.sql'));
		expect(readFileSync(written, 'utf8')).toBe('INSERT INTO threads VALUES (1);');
		const kept = readdirSync(folder).sort();
		expect(kept).toHaveLength(keptBackups);
		expect(kept[0]).toBe('todos-2026-09-02.db');
	});

	it('leaves no file behind when the export fails', () => {
		const folder = mkdtempSync(join(tmpdir(), 'todos-backup-'));
		expect(() => backupHosted(folder, new Date(2026, 9, 25), () => {
			throw new Error('not signed in');
		})).toThrow('not signed in');
		expect(readdirSync(folder)).toEqual([]);
	});
});
