import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Server} from 'node:http';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createApi} from '../src/api/server.js';
import {ApiError, Client} from '../src/client/client.js';
import {Tasks} from '../src/core/tasks.js';
import {Projects} from '../src/core/projects.js';
import {Thoughts} from '../src/core/thoughts.js';
import {Threads} from '../src/core/threads.js';
import {SqliteStorage} from '../src/storage/sqlite.js';

let server: Server;
let storage: SqliteStorage;
let client: Client;
let dbPath: string;
let web: string;

const start = async () => {
	storage = new SqliteStorage(dbPath);
	server = createApi(new Threads(storage), new Tasks(storage), new Thoughts(storage), new Projects(storage), {web});
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	client = new Client(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
};

const stop = async () => {
	await new Promise(resolve => server.close(resolve));
	storage.close();
};

beforeEach(async () => {
	const dir = mkdtempSync(join(tmpdir(), 'todos-api-'));
	dbPath = join(dir, 'todos.db');
	web = join(dir, 'web');
	mkdirSync(join(web, 'assets'), {recursive: true});
	writeFileSync(join(web, 'index.html'), '<title>todos</title>');
	writeFileSync(join(web, 'assets', 'app.js'), 'run()');
	writeFileSync(join(dir, 'secret.txt'), 'not for the web');
	await start();
});

afterEach(stop);

describe('the web app', () => {
	const get = async (path: string) => {
		const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
		return {status: response.status, type: response.headers.get('content-type'), text: await response.text()};
	};

	it('serves its files, and the page at any other path outside /api', async () => {
		expect(await get('/')).toMatchObject({status: 200, type: 'text/html; charset=utf-8', text: '<title>todos</title>'});
		expect(await get('/assets/app.js')).toMatchObject({type: 'text/javascript', text: 'run()'});
		expect((await get('/today')).text).toBe('<title>todos</title>');
		expect((await get('/api/nothing')).status).toBe(404);
	});

	it('never serves a file from outside its folder', async () => {
		expect((await get('/../secret.txt')).text).toBe('<title>todos</title>');
		expect((await get('/%2e%2e/secret.txt')).text).toBe('<title>todos</title>');
	});
});

describe('the API with its client', () => {
	it('reads one Task, open or ended', async () => {
		const task = await client.addTask({title: 'Buy a card', notes: 'A blank one.'});
		await client.editTask(task.id, {ended: 'done'});
		expect(await client.task(task.id)).toMatchObject({title: 'Buy a card', notes: 'A blank one.', ended: 'done'});
		await expect(client.task('missing')).rejects.toMatchObject({status: 404});
	});

	it('lists the Logbook', async () => {
		const task = await client.addTask({title: 'Buy a card'});
		await client.editTask(task.id, {ended: 'done'});
		expect((await client.logbook()).map(t => t.title)).toEqual(['Buy a card']);
		expect(await client.tasks()).toEqual([]);
	});

	it('keeps the Notes, Checklist and Deadline of a Task', async () => {
		const task = await client.addTask({title: 'Renew the passport'});
		const checklist = [{id: 'a', title: 'Get a photo taken', done: false}];
		await client.editTask(task.id, {notes: 'Runs out in March.', checklist, deadline: {kind: 'by_day', day: '2026-11-01'}});
		await stop();
		await start();
		expect((await client.tasks())[0]).toMatchObject({notes: 'Runs out in March.', checklist, deadline: {kind: 'by_day', day: '2026-11-01'}});
	});

	it('creates, nests, edits and lists Threads', async () => {
		const launch = await client.create('Launch v1');
		const mcp = await client.create('Build the MCP server', launch.id);
		await client.edit(mcp.id, {summary: 'Schema settled.', nextStep: 'Waiting on CI', whoseMove: 'waiting'});
		const all = await client.threads();
		expect(all.map(t => t.title).sort()).toEqual(['Build the MCP server', 'Launch v1']);
		expect(await client.thread(mcp.id)).toMatchObject({parentId: launch.id, nextStep: 'Waiting on CI'});
	});

	it('keeps the day and deadline a Thread is made with', async () => {
		const thread = await client.create('Renew the passport', null, null, {when: {kind: 'on_day', day: '2026-12-01'}, deadline: {kind: 'by_day', day: '2026-12-20'}});
		expect(await client.thread(thread.id)).toMatchObject({when: {kind: 'on_day', day: '2026-12-01'}, deadline: {kind: 'by_day', day: '2026-12-20'}});
	});

	it('keeps Threads in the SQLite file across a restart', async () => {
		const thread = await client.create('Move house');
		await stop();
		await start();
		expect((await client.thread(thread.id)).title).toBe('Move house');
	});

	it('turns rule breaks into errors with a reason', async () => {
		const thread = await client.create('Move house');
		await expect(client.move(thread.id, thread.id)).rejects.toMatchObject({status: 400});
		await expect(client.thread('missing')).rejects.toBeInstanceOf(ApiError);
	});

	it('runs Session turns', async () => {
		const thread = await client.create('MCP');
		await client.recordSession(thread.id, {claudeSessionId: 'abc', sessionPane: '%3'});
		await client.signal(thread.id, 'busy');
		expect((await client.thread(thread.id)).sessionSignal).toBe('busy');
		await client.signal(thread.id, 'finished');
		expect(await client.thread(thread.id)).toMatchObject({claudeSessionId: 'abc', sessionSignal: 'finished'});
	});

	it('adds, ticks off, renames and reorders Tasks', async () => {
		const house = await client.create('Move house');
		const wrap = await client.addTask({title: 'Buy bubble wrap', threadId: house.id});
		const glasses = await client.addTask({title: 'Wrap the glasses', threadId: house.id});
		await client.addTask({title: 'Tape the boxes', after: wrap.id});
		await client.reorderTask(glasses.id, 'up');
		await client.editTask(wrap.id, {title: 'Buy more bubble wrap', ended: 'done'});
		expect((await client.tasks()).sort((a, b) => a.position - b.position).map(t => t.title)).toEqual(['Wrap the glasses', 'Tape the boxes']);
		await expect(client.addTask({title: ''})).rejects.toMatchObject({status: 400});
	});

	it('answers a poll with nothing until something changes, then with the Threads and Tasks', async () => {
		const first = await client.changes({kind: 'nothing'});
		if (first.kind !== 'changed') throw new Error('A client that has seen nothing gets everything');
		const seen = {kind: 'number' as const, number: first.number};
		expect(await client.changes(seen)).toEqual({kind: 'same'});
		const house = await client.create('Move house');
		await client.addTask({title: 'Pack', threadId: house.id});
		expect(await client.changes(seen)).toMatchObject({kind: 'changed', threads: [{title: 'Move house'}], tasks: [{title: 'Pack'}]});
	});

	it('refuses the fields of older clients with a word to restart', async () => {
		const task = await client.addTask({title: 'Buy a card'});
		await expect(client.editTask(task.id, {place: 'today'} as never)).rejects.toMatchObject({status: 400, message: expect.stringContaining('Restart the Session')});
	});

	it('keeps Tasks in the SQLite file across a restart', async () => {
		await client.addTask({title: 'Call the landlord'});
		await stop();
		await start();
		expect((await client.tasks()).map(t => t.title)).toEqual(['Call the landlord']);
	});

	it('keeps one page of Thoughts, refusing a save over a newer page', async () => {
		expect(await client.thoughts()).toEqual({text: '', version: 0});
		expect(await client.saveThoughts('# web app\nWaiting first?', 0)).toEqual({saved: true, version: 1});
		// A copy still at version 0 would overwrite what was just written.
		expect(await client.saveThoughts('older copy', 0)).toEqual({saved: false, page: {text: '# web app\nWaiting first?', version: 1}});
		await expect(client.saveThoughts(undefined as any, 1)).rejects.toMatchObject({status: 400});
		await stop();
		await start();
		expect(await client.thoughts()).toEqual({text: '# web app\nWaiting first?', version: 1});
	});
});

describe('changes sent from another website', () => {
	// A form on another site can send plain text or form data with my
	// sign-in cookie, but cannot send JSON without the API's permission.
	it.each([
		['plain text', 'text/plain', '{"title": "Junk"}'],
		['a form', 'application/x-www-form-urlencoded', 'title=Junk'],
	])('turns away %s and makes nothing', async (_, type, body) => {
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tasks`;
		const response = await fetch(url, {method: 'POST', headers: {'content-type': type}, body});
		expect(response.status).toBe(415);
		expect(await client.tasks()).toEqual([]);
	});

	// Hooks from an older build call this route with no body when a prompt
	// arrives, so it also stands in for any change sent with no body.
	it('still takes a change with no body, and never reminds', async () => {
		const thread = await client.create('Host todos');
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/threads/${thread.id}/turn-started`;
		const response = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}});
		expect(await response.json()).toEqual({remind: false});
		expect((await client.thread(thread.id)).sessionSignal).toBe('busy');
	});
});
