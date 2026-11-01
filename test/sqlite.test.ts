import {mkdtempSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {Threads} from '../src/core/threads.js';
import {migrations, SqliteStorage} from '../src/storage/sqlite.js';

describe('the SQLite file', () => {
	it('moves what a Waiting Thread waits on into its next step', async () => {
		const path = join(mkdtempSync(join(tmpdir(), 'todos-sqlite-')), 'todos.db');
		const old = new DatabaseSync(path);
		old.exec(`CREATE TABLE threads (
			id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', next_step TEXT NOT NULL DEFAULT '',
			state TEXT NOT NULL, waiting_on TEXT, parent_id TEXT REFERENCES threads(id), position REAL NOT NULL,
			directory TEXT, claude_session_id TEXT, session_pane TEXT, session_signal TEXT,
			updated_this_turn INTEGER NOT NULL DEFAULT 0, my_edit_at TEXT, session_update_at TEXT, created_at TEXT NOT NULL
		); PRAGMA user_version = 1;`);
		old.exec(`INSERT INTO threads (id, title, summary, next_step, state, waiting_on, position, my_edit_at, session_update_at, created_at) VALUES
			('a', 'Council tax', 'Form sent.', 'Chase them', 'waiting', 'the council', 0, '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', ''),
			('b', 'Move house', '', '', 'on_me', NULL, 1, NULL, NULL, '')`);
		old.close();

		const storage = new SqliteStorage(path);
		expect(await storage.getThread('a')).toMatchObject({nextStep: 'Waiting on the council', summaryUpdatedAt: '2026-10-02T00:00:00Z'});
		expect(await storage.getThread('b')).toMatchObject({nextStep: '', notes: '', summaryUpdatedAt: null});
		expect(await storage.getThread('a')).not.toHaveProperty('waitingOn');
		storage.close();
	});

	it('gives every Thread empty Notes, and keeps them once written', async () => {
		const path = join(mkdtempSync(join(tmpdir(), 'todos-sqlite-')), 'todos.db');
		const first = new SqliteStorage(path);
		const thread = await new Threads(first).create({title: 'Move house'});
		expect(thread.notes).toBe('');
		await new Threads(first).edit(thread.id, {notes: 'Van booked for Friday.'});
		first.close();
		const again = new SqliteStorage(path);
		expect((await again.getThread(thread.id))!.notes).toBe('Van booked for Friday.');
		again.close();
	});

	it('splits the state of each Thread into whose move, When and Ended', async () => {
		const path = join(mkdtempSync(join(tmpdir(), 'todos-sqlite-')), 'todos.db');
		const old = new DatabaseSync(path);
		for (const sql of migrations().slice(0, 8)) old.exec(sql);
		old.exec('PRAGMA user_version = 8');
		const states = ['on_me', 'waiting', 'someday', 'done', 'dropped'];
		for (const state of states) old.exec(`INSERT INTO threads (id, title, state, position, created_at) VALUES ('${state}', '${state}', '${state}', 0, '')`);
		old.close();

		const storage = new SqliteStorage(path);
		const facts = async (id: string) => {
			const {whoseMove, when, ended, deadline} = (await storage.getThread(id))!;
			return {whoseMove, when: when.kind, ended, deadline: deadline.kind};
		};
		expect(await Promise.all(states.map(facts))).toEqual([
			{whoseMove: 'on_me', when: 'active', ended: 'not_ended', deadline: 'none'},
			{whoseMove: 'waiting', when: 'active', ended: 'not_ended', deadline: 'none'},
			{whoseMove: 'on_me', when: 'someday', ended: 'not_ended', deadline: 'none'},
			{whoseMove: 'on_me', when: 'active', ended: 'done', deadline: 'none'},
			{whoseMove: 'on_me', when: 'active', ended: 'dropped', deadline: 'none'},
		]);
		storage.close();
	});

	it("turns each Task's list, Date and state into When and Ended", async () => {
		const path = join(mkdtempSync(join(tmpdir(), 'todos-sqlite-')), 'todos.db');
		const old = new DatabaseSync(path);
		for (const sql of migrations().slice(0, 9)) old.exec(sql);
		old.exec('PRAGMA user_version = 9');
		old.exec(`INSERT INTO tasks (id, title, place, position, date, deadline, state, ended_at, created_at) VALUES
			('a', 'Pack', 'today', 0, NULL, NULL, 'open', NULL, ''),
			('b', 'Collect the van', 'inbox', 1, '2026-11-02', '2026-11-05', 'open', NULL, ''),
			('c', 'Buy a card', 'someday', 2, NULL, NULL, 'done', '2026-10-01T00:00:00Z', ''),
			('d', 'Put the bins out', 'anytime', 3, NULL, NULL, 'dropped', '2026-10-01T00:00:00Z', '')`);
		old.close();

		const storage = new SqliteStorage(path);
		const facts = async (id: string) => {
			const {when, ended, deadline} = (await storage.getTask(id))!;
			return {when, ended, deadline};
		};
		expect(await Promise.all(['a', 'b', 'c', 'd'].map(facts))).toEqual([
			{when: {kind: 'today'}, ended: 'not_ended', deadline: {kind: 'none'}},
			{when: {kind: 'on_day', day: '2026-11-02'}, ended: 'not_ended', deadline: {kind: 'by_day', day: '2026-11-05'}},
			{when: {kind: 'someday'}, ended: 'done', deadline: {kind: 'none'}},
			{when: {kind: 'anytime'}, ended: 'dropped', deadline: {kind: 'none'}},
		]);
		storage.close();
	});
});
