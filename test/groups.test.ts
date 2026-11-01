import {beforeEach, describe, expect, it} from 'vitest';
import {Tasks} from '../src/core/tasks.js';
import {Threads} from '../src/core/threads.js';
import {groupedByThread} from '../web/src/groups.js';
import {makeStorage} from './support.js';

let tasks: Tasks;
let threads: Threads;

beforeEach(async () => {
	const storage = await makeStorage();
	tasks = new Tasks(storage);
	threads = new Threads(storage);
});

const shown = (rows: ReturnType<typeof groupedByThread>) => rows.map(row => (row.kind === 'thread' ? `-- ${row.thread.title} --` : row.task.title));

describe("grouping a list's Tasks under their Threads in the web app", () => {
	it('puts Tasks with no Thread first, then a group per Thread in tree order', async () => {
		const party = await threads.create({title: 'Plan a party'});
		const venue = await threads.create({title: 'Book a venue', parentId: party.id});
		const boiler = await threads.create({title: 'Fix the boiler'});
		await tasks.add({title: 'Ring the engineer', threadId: boiler.id});
		await tasks.add({title: 'Buy milk'});
		await tasks.add({title: 'Ring the pub', threadId: venue.id});
		await tasks.add({title: 'Order a cake', threadId: party.id});
		expect(shown(groupedByThread(await tasks.list(), await threads.list()))).toEqual([
			'Buy milk',
			'-- Plan a party --',
			'Order a cake',
			'-- Book a venue --',
			'Ring the pub',
			'-- Fix the boiler --',
			'Ring the engineer',
		]);
	});

	it('gives a heading to each Thread asked for even with no Tasks, such as Someday Threads in Someday', async () => {
		const writing = await threads.create({title: 'Writing'});
		const calm = await threads.create({title: 'Write on calm software', parentId: writing.id});
		const sail = await threads.create({title: 'Learn to sail'});
		await tasks.add({title: 'Pick up the cake', when: {kind: 'someday'}});
		await tasks.add({title: 'Find a course', when: {kind: 'someday'}, threadId: sail.id});
		const all = await threads.list();
		const also = all.filter(thread => [writing.id, calm.id, sail.id].includes(thread.id));
		expect(shown(groupedByThread(await tasks.list(), all, also))).toEqual([
			'Pick up the cake',
			'-- Writing --',
			'-- Write on calm software --',
			'-- Learn to sail --',
			'Find a course',
		]);
	});

	it('shows a Task with no Thread when its Thread is not known yet', async () => {
		const boiler = await threads.create({title: 'Fix the boiler'});
		await tasks.add({title: 'Ring the engineer', threadId: boiler.id});
		expect(shown(groupedByThread(await tasks.list(), []))).toEqual(['Ring the engineer']);
	});
});
