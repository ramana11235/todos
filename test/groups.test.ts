import {beforeEach, describe, expect, it} from 'vitest';
import {Tasks} from '../src/core/tasks.js';
import {Threads} from '../src/core/threads.js';
import {groupedByThread} from '../src/core/task.js';
import {upcomingRows} from '../web/src/groups.js';
import {makeStorage} from './support.js';

let tasks: Tasks;
let threads: Threads;

beforeEach(async () => {
	const storage = await makeStorage();
	tasks = new Tasks(storage);
	threads = new Threads(storage);
});

const shown = (rows: ReturnType<typeof upcomingRows>) =>
	rows.map(row => (row.kind === 'day' ? `## ${row.day} ##` : row.kind === 'thread' ? `-- ${row.thread.title} --` : row.task.title));

describe("grouping a list's Tasks under their Threads in the web app", () => {
	it('puts Tasks with no Thread first, then a group per Thread in tree order', async () => {
		const party = await threads.create({title: 'Plan a party'});
		const venue = await threads.create({title: 'Book a venue', parentId: party.id});
		const boiler = await threads.create({title: 'Fix the boiler'});
		await tasks.add({title: 'Ring the engineer', threadId: boiler.id});
		await tasks.add({title: 'Buy milk'});
		await tasks.add({title: 'Ring the pub', threadId: venue.id});
		await tasks.add({title: 'Order a cake', threadId: party.id});
		expect(shown(groupedByThread(await tasks.list(), await threads.list(), '2026-11-01'))).toEqual([
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
		expect(shown(groupedByThread(await tasks.list(), all, '2026-11-01', also))).toEqual([
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
		expect(shown(groupedByThread(await tasks.list(), [], '2026-11-01'))).toEqual(['Ring the engineer']);
	});
});

describe("Upcoming's rows in the web app", () => {
	it('puts a heading for each day, then within the day the Tasks with no Thread and a group per Thread', async () => {
		const party = await threads.create({title: 'Plan a party'});
		const tax = await threads.create({title: 'Do the tax return', when: {kind: 'on_day', day: '2099-01-03'}});
		const passport = await threads.create({title: 'Renew passport', when: {kind: 'on_day', day: '2099-01-10'}});
		await threads.create({title: 'Went by', when: {kind: 'on_day', day: '2000-01-01'}});
		const on = (day: string) => ({kind: 'on_day' as const, day});
		await tasks.add({title: 'Take the bins out', when: on('2099-01-06')});
		await tasks.add({title: 'Collect the cake', when: on('2099-01-03'), threadId: party.id});
		await tasks.add({title: 'Find the P60', when: on('2099-01-03'), threadId: tax.id});
		await tasks.add({title: 'Water the plants', when: on('2099-01-03')});
		expect(shown(upcomingRows(await tasks.list(), await threads.list(), '2026-11-01'))).toEqual([
			'## 2099-01-03 ##', 'Water the plants', '-- Plan a party --', 'Collect the cake', '-- Do the tax return --', 'Find the P60',
			'## 2099-01-06 ##', 'Take the bins out',
			'## 2099-01-10 ##', '-- Renew passport --',
		]);
	});

	it('leaves out a Thread that has ended, even on a day still ahead', async () => {
		const passport = await threads.create({title: 'Renew passport', when: {kind: 'on_day', day: '2099-01-10'}});
		await threads.edit(passport.id, {ended: 'done'});
		expect(shown(upcomingRows([], await threads.list(), '2026-11-01'))).toEqual([]);
	});
});
