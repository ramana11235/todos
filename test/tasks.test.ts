import {beforeEach, describe, expect, it} from 'vitest';
import {batchLimit, createHandler, turnsIntoThreadsLimit} from '../src/api/api.js';
import {Thoughts} from '../src/core/thoughts.js';
import {listOf, listRows, type Task} from '../src/core/task.js';
import {belongingOrder} from '../src/core/project.js';
import {Projects} from '../src/core/projects.js';
import {Tasks} from '../src/core/tasks.js';
import {ThreadError, Threads} from '../src/core/threads.js';
import type {Storage} from '../src/storage/storage.js';
import {makeStorage, readNow} from './support.js';

let storage: Storage;
let tasks: Tasks;
let threads: Threads;

beforeEach(async () => {
	storage = await makeStorage();
	const now = () => new Date('2026-10-18T09:00:00');
	tasks = new Tasks(storage, now);
	threads = new Threads(storage, now);
});

const today = '2026-10-18';

// The rows of a list as text, with Thread headers as `-- title --`,
// project and area headings as `== area › project ==` and days as `## day ##`.
const shown = async (list: Parameters<typeof listRows>[2]) => {
	const projects = new Projects(storage);
	const order = belongingOrder(await projects.listProjects(), await projects.listAreas());
	return listRows(await tasks.list(), await threads.list(), list, today, order).map(row =>
		row.kind === 'belonging' ? `== ${row.belonging.path.join(' › ')}${row.belonging.ended === 'not_ended' ? '' : ` (${row.belonging.ended})`} ==`
		: row.kind === 'day' ? `## ${row.day} ##`
		: row.kind === 'thread' ? `-- ${row.thread.title} --` : row.task.title,
	);
};

const dated = async (title: string, date: string, threadId: string | null = null): Promise<Task> => {
	const task = await tasks.add({title, threadId});
	const when = {kind: 'on_day' as const, day: date};
	await storage.saveTask({...task, when});
	return {...task, when};
};

describe('adding Tasks', () => {
	it('puts a new Task at the end of the Inbox with no Thread', async () => {
		await tasks.add({title: 'Call the landlord'});
		const task = await tasks.add({title: '  Book the dentist '});
		expect(task).toMatchObject({title: 'Book the dentist', when: {kind: 'inbox'}, threadId: null, ended: 'not_ended'});
		expect(await shown('inbox')).toEqual(['Call the landlord', 'Book the dentist']);
	});

	it('gives a new Task the Date it is made with, in one go', async () => {
		const task = await tasks.add({title: 'Ring the pub', when: {kind: 'on_day', day: '2099-11-03'}});
		expect(task.when).toEqual({kind: 'on_day', day: '2099-11-03'});
		expect((await tasks.get(task.id)).when).toEqual({kind: 'on_day', day: '2099-11-03'});
		await expect(tasks.add({title: 'Never', when: {kind: 'on_day', day: 'next week'}})).rejects.toThrow(ThreadError);
		expect((await tasks.list()).map(t => t.title)).toEqual(['Ring the pub']);
	});

	it('keeps the Notes a new Task is made with', async () => {
		expect((await tasks.add({title: 'Check the panel', notes: '1. Open Home\n2. Press t'})).notes).toBe('1. Open Home\n2. Press t');
		expect((await tasks.add({title: 'Call the landlord'})).notes).toBe('');
	});

	it('keeps the Deadline and Checklist a new Task is made with, checked as an edit checks them', async () => {
		const task = await tasks.add({title: 'Renew the passport', deadline: {kind: 'by_day', day: '2026-11-01'}, checklist: [{title: 'Get a photo taken'} as any]});
		expect(task).toMatchObject({deadline: {kind: 'by_day', day: '2026-11-01'}, checklist: [{id: expect.any(String), title: 'Get a photo taken', done: false}]});
		await expect(tasks.add({title: 'Pay rent', deadline: {kind: 'by_day', day: 'soon'}})).rejects.toThrow(ThreadError);
		await expect(tasks.add({title: 'Pay rent', checklist: 'Pay' as any})).rejects.toThrow(ThreadError);
	});

	it('refuses a Task with no title, in a list that does not exist, or on a missing Thread', async () => {
		await expect(tasks.add({title: ' '})).rejects.toThrow(ThreadError);
		await expect(tasks.add({title: 'Pay rent', when: {kind: 'upcoming'} as any})).rejects.toThrow(ThreadError);
		await expect(tasks.add({title: 'Pay rent', threadId: 'missing'})).rejects.toThrow(ThreadError);
	});

	it('puts a Task added after another right after it, in the same list and under the same Thread', async () => {
		const house = await threads.create({title: 'Move house'});
		const wrap = await tasks.add({title: 'Buy bubble wrap', when: {kind: 'today'}, threadId: house.id});
		await tasks.add({title: 'Wrap the glasses', when: {kind: 'today'}, threadId: house.id});
		await tasks.add({title: 'Book the dentist', when: {kind: 'today'}});
		await tasks.add({title: 'Tape the boxes', after: wrap.id});
		expect(await shown('today')).toEqual(['Book the dentist', '-- Move house --', 'Buy bubble wrap', 'Tape the boxes', 'Wrap the glasses']);
	});

	it('gives a Task added after one in Upcoming the same Date', async () => {
		const van = await dated('Collect the van', '2026-10-28');
		expect((await tasks.add({title: 'Fill up the van', after: van.id})).when).toEqual({kind: 'on_day', day: '2026-10-28'});
	});
});

describe('which list a Task is in', () => {
	it('is the list it was put in until it has a Date', async () => {
		const task = await tasks.add({title: 'Renew the passport', when: {kind: 'anytime'}});
		expect(listOf(task, today)).toBe('anytime');
		expect(listOf({...task, when: {kind: 'on_day', day: '2026-10-25'}}, today)).toBe('upcoming');
		expect(listOf({...task, when: {kind: 'on_day', day: today}}, today)).toBe('today');
		expect(listOf({...task, when: {kind: 'on_day', day: '2026-10-01'}}, today)).toBe('today');
	});
});

describe('placing a Task in its list', () => {
	it('moves a Task to a place among the Tasks of its list and Thread', async () => {
		const house = await threads.create({title: 'Move house'});
		const a = await tasks.add({title: 'A', when: {kind: 'today'}});
		await tasks.add({title: 'B', when: {kind: 'today'}});
		const c = await tasks.add({title: 'C', when: {kind: 'today'}});
		await tasks.add({title: 'Pack', when: {kind: 'today'}, threadId: house.id});
		await tasks.edit(c.id, {index: 0});
		expect(await shown('today')).toEqual(['C', 'A', 'B', '-- Move house --', 'Pack']);
		await tasks.edit(a.id, {index: 9});
		expect(await shown('today')).toEqual(['C', 'B', 'A', '-- Move house --', 'Pack']);
		// With a new Thread, the place is among the Tasks of that Thread.
		await tasks.edit(c.id, {threadId: house.id, index: 0});
		expect(await shown('today')).toEqual(['B', 'A', '-- Move house --', 'C', 'Pack']);
	});

	it('adds a Task at a place in its list', async () => {
		await tasks.add({title: 'A', when: {kind: 'today'}});
		await tasks.add({title: 'B', when: {kind: 'today'}});
		await tasks.add({title: 'Between', when: {kind: 'today'}, index: 1});
		expect(await shown('today')).toEqual(['A', 'Between', 'B']);
	});

	// Halving a gap runs out after about 50 Tasks, so the list is numbered
	// again from 0 when it does.
	it('keeps 100 Tasks added straight after the same Task, or at the same place, in the order they went in', async () => {
		// Away from 0, where a number has fewer places to halve into.
		await tasks.add({title: 'Elsewhere'});
		const first = await tasks.add({title: 'First', when: {kind: 'today'}});
		const titles = Array.from({length: 100}, (_, n) => `T${n}`);
		for (const title of titles) await tasks.add({title, after: first.id});
		expect(await shown('today')).toEqual(['First', ...titles.toReversed()]);
		const second = await tasks.add({title: 'Second', when: {kind: 'anytime'}});
		await tasks.add({title: 'Last', when: {kind: 'anytime'}});
		for (const title of titles) await tasks.add({title, when: {kind: 'anytime'}, index: 1});
		expect((await shown('anytime')).slice(1, -1)).toEqual(titles.toReversed());
		expect((await shown('anytime'))[0]).toBe(second.title);
	});

	it('refuses a place in Upcoming or for an ended Task, changing nothing', async () => {
		const later = await dated('Renew the passport', '2026-12-01');
		await expect(tasks.edit(later.id, {index: 0})).rejects.toThrow('Upcoming is in date order');
		const ended = await tasks.add({title: 'Call the landlord'});
		await expect(tasks.edit(ended.id, {ended: 'done', index: 0})).rejects.toThrow(ThreadError);
		expect((await tasks.get(ended.id)).ended).toBe('not_ended');
		await expect(tasks.edit(ended.id, {index: -1})).rejects.toThrow(ThreadError);
	});
});

describe('laying out a list', () => {
	it('puts Tasks with no Thread first, then a group per Thread in tree order', async () => {
		const todos = await threads.create({title: 'Build todos'});
		const house = await threads.create({title: 'Move house'});
		const web = await threads.create({title: 'Build the web app', parentId: todos.id});
		await tasks.add({title: 'Pack the kitchen', threadId: house.id});
		await tasks.add({title: 'Sketch the sidebar', threadId: web.id});
		await tasks.add({title: 'Call the landlord', when: {kind: 'anytime'}});
		await tasks.add({title: 'Try the panel', threadId: todos.id});
		expect(await shown('anytime')).toEqual([
			'Call the landlord',
			'-- Build todos --', 'Try the panel',
			'-- Build the web app --', 'Sketch the sidebar',
			'-- Move house --', 'Pack the kitchen',
		]);
	});

	it('shows a Task with no Thread when its Thread is not known yet, as the web app does', async () => {
		const house = await threads.create({title: 'Move house'});
		await tasks.add({title: 'Pack the kitchen', threadId: house.id});
		expect(listRows(await tasks.list(), [], 'anytime', today, []).map(row => (row.kind === 'task' ? row.task.title : row.kind))).toEqual(['Pack the kitchen']);
	});

	it('puts Upcoming under a heading for each day, grouped by Thread within the day and not by project', async () => {
		const projects = new Projects(storage);
		const flat = await projects.createProject({title: 'New flat'});
		const house = await threads.create({title: 'Move house', belongs: {kind: 'project', id: flat.id}});
		await dated('Collect the van', '2026-10-28', house.id);
		await dated('Book the removals', '2026-10-25', house.id);
		await dated('Ring the bank', '2026-10-25');
		await dated('Return the books', '2026-10-24');
		expect(await shown('upcoming')).toEqual([
			'## 2026-10-24 ##', 'Return the books',
			'## 2026-10-25 ##', 'Ring the bank', '-- Move house --', 'Book the removals',
			'## 2026-10-28 ##', '-- Move house --', 'Collect the van',
		]);
	});
});

describe('ticking off, renaming and reordering', () => {
	it('keeps both of two edits to different fields of a Task made at the same moment', async () => {
		const task = await tasks.add({title: 'Call the landlord'});
		const early = new Tasks(await readNow(storage));
		await tasks.edit(task.id, {notes: 'About the boiler'});
		await early.edit(task.id, {title: 'Ring the landlord'});
		expect(await tasks.get(task.id)).toMatchObject({title: 'Ring the landlord', notes: 'About the boiler'});
	});

	it('takes a ticked Task out of its list and brings it back when unticked', async () => {
		const task = await tasks.add({title: 'Call the landlord'});
		expect(await tasks.edit(task.id, {ended: 'done'})).toMatchObject({ended: 'done', endedAt: expect.any(String)});
		expect(await shown('inbox')).toEqual([]);
		await tasks.edit(task.id, {ended: 'not_ended'});
		expect(await shown('inbox')).toEqual(['Call the landlord']);
	});

	it('renames a Task but never to nothing', async () => {
		const task = await tasks.add({title: 'Call the landlord'});
		expect((await tasks.edit(task.id, {title: 'Call the letting agent'})).title).toBe('Call the letting agent');
		await expect(tasks.edit(task.id, {title: ''})).rejects.toThrow(ThreadError);
	});

	it('moves a Task to another list, Date or Thread, and drops it', async () => {
		const house = await threads.create({title: 'Move house'});
		const task = await tasks.add({title: 'Call the landlord'});
		expect(await tasks.edit(task.id, {when: {kind: 'anytime'}, threadId: house.id})).toMatchObject({when: {kind: 'anytime'}, threadId: house.id});
		expect(listOf(await tasks.edit(task.id, {when: {kind: 'on_day', day: '2026-10-20'}}), today)).toBe('upcoming');
		expect(await tasks.edit(task.id, {when: {kind: 'today'}})).toMatchObject({when: {kind: 'today'}});
		expect(await tasks.edit(task.id, {threadId: null})).toMatchObject({threadId: null});
		expect(await tasks.edit(task.id, {ended: 'dropped'})).toMatchObject({ended: 'dropped', endedAt: expect.any(String)});
		await expect(tasks.edit(task.id, {when: {kind: 'upcoming'} as never})).rejects.toThrow(ThreadError);
		await expect(tasks.edit(task.id, {threadId: 'nope'})).rejects.toThrow(ThreadError);
		for (const day of ['next tuesday', '2026-02-30', '2026-1-5']) await expect(tasks.edit(task.id, {when: {kind: 'on_day', day}})).rejects.toThrow(ThreadError);
	});

	it('moves a Task out of the Inbox to Anytime when it is linked to a Thread', async () => {
		const house = await threads.create({title: 'Move house'});
		const inbox = await tasks.add({title: 'Call the landlord'});
		expect(await tasks.edit(inbox.id, {threadId: house.id})).toMatchObject({when: {kind: 'anytime'}, threadId: house.id});
		expect((await tasks.get(inbox.id)).when).toEqual({kind: 'anytime'});
		// Unlinking leaves it where it is.
		expect((await tasks.edit(inbox.id, {threadId: null})).when).toEqual({kind: 'anytime'});
		// A Task in another list keeps it, and even asking for the Inbox with
		// the link puts it in Anytime, because a linked Task is never there.
		const someday = await tasks.add({title: 'Paint the hall', when: {kind: 'someday'}});
		expect((await tasks.edit(someday.id, {threadId: house.id})).when).toEqual({kind: 'someday'});
		const kept = await tasks.add({title: 'Ask Jo'});
		expect((await tasks.edit(kept.id, {threadId: house.id, when: {kind: 'inbox'}})).when).toEqual({kind: 'anytime'});
	});

	it('keeps a Task that belongs to a Thread, project or area out of the Inbox', async () => {
		const house = await threads.create({title: 'Move house'});
		const projects = new Projects(storage);
		const home = await projects.createArea({title: 'Home'});
		const flat = await projects.createProject({title: 'Move flat'});
		expect((await tasks.add({title: 'Pack the kitchen', threadId: house.id})).when).toEqual({kind: 'anytime'});
		expect((await tasks.add({title: 'Fix the tap', belongs: {kind: 'area', id: home.id}})).when).toEqual({kind: 'anytime'});
		expect((await tasks.add({title: 'Book the van', belongs: {kind: 'project', id: flat.id}, when: {kind: 'inbox'}})).when).toEqual({kind: 'anytime'});
		const loose = await tasks.add({title: 'Buy milk'});
		expect(loose.when).toEqual({kind: 'inbox'});
		expect((await tasks.edit(loose.id, {belongs: {kind: 'area', id: home.id}})).when).toEqual({kind: 'anytime'});
		expect((await tasks.edit(loose.id, {belongs: {kind: 'none'}})).when).toEqual({kind: 'anytime'});
	});

	it('moves a Task only within its group', async () => {
		const house = await threads.create({title: 'Move house'});
		const card = await tasks.add({title: 'Buy a card', when: {kind: 'anytime'}});
		const wrap = await tasks.add({title: 'Buy bubble wrap', threadId: house.id});
		await tasks.add({title: 'Wrap the glasses', threadId: house.id});
		await tasks.reorder(wrap.id, 'up');
		expect(await shown('anytime')).toEqual(['Buy a card', '-- Move house --', 'Buy bubble wrap', 'Wrap the glasses']);
		await tasks.reorder(wrap.id, 'down');
		await tasks.reorder(card.id, 'down');
		expect(await shown('anytime')).toEqual(['Buy a card', '-- Move house --', 'Wrap the glasses', 'Buy bubble wrap']);
	});

	it('puts a Task at any position, so it can be dragged anywhere in its list', async () => {
		const card = await tasks.add({title: 'Buy a card'});
		await tasks.add({title: 'Wrap the glasses'});
		await tasks.add({title: 'Call the landlord'});
		await tasks.edit(card.id, {position: 1.5});
		expect(await shown('inbox')).toEqual(['Wrap the glasses', 'Buy a card', 'Call the landlord']);
		await expect(tasks.edit(card.id, {position: 'first' as never})).rejects.toThrow(ThreadError);
	});

	it('leaves Upcoming in date order', async () => {
		const later = await dated('Collect the van', '2026-10-28');
		await dated('Book the removals', '2026-10-25');
		await tasks.reorder(later.id, 'up');
		expect(await shown('upcoming')).toEqual(['## 2026-10-25 ##', 'Book the removals', '## 2026-10-28 ##', 'Collect the van']);
	});

	it('leaves a Task alone when its Thread ends', async () => {
		const house = await threads.create({title: 'Move house'});
		await tasks.add({title: 'Pack the kitchen', threadId: house.id});
		await threads.edit(house.id, {ended: 'done'});
		expect(await shown('anytime')).toEqual(['-- Move house --', 'Pack the kitchen']);
	});
});

describe('Notes, a Checklist and a Deadline', () => {
	it('starts a Task with none of them', async () => {
		expect(await tasks.add({title: 'Renew the passport'})).toMatchObject({notes: '', checklist: [], deadline: {kind: 'none'}});
	});

	it('keeps them, and the Deadline never moves the Task', async () => {
		const task = await tasks.add({title: 'Renew the passport', when: {kind: 'anytime'}});
		const checklist = [
			{id: 'a', title: 'Get a photo taken', done: true},
			{id: 'b', title: 'Fill in the form', done: false},
		];
		await tasks.edit(task.id, {notes: 'The old one runs out in March.', checklist, deadline: {kind: 'by_day', day: '2026-10-20'}});
		const saved = await tasks.get(task.id);
		expect(saved).toMatchObject({notes: 'The old one runs out in March.', checklist, deadline: {kind: 'by_day', day: '2026-10-20'}, when: {kind: 'anytime'}});
		expect(listOf(saved, today)).toBe('anytime');
		expect(await tasks.edit(task.id, {deadline: {kind: 'none'}})).toMatchObject({deadline: {kind: 'none'}});
	});

	it('refuses a Deadline that is not a day and a Checklist step with no title', async () => {
		const task = await tasks.add({title: 'Renew the passport'});
		await expect(tasks.edit(task.id, {deadline: {kind: 'by_day', day: 'soon'}})).rejects.toThrow(ThreadError);
		await expect(tasks.edit(task.id, {checklist: [{id: 'a', title: '', done: false}]})).rejects.toThrow(ThreadError);
		await expect(tasks.edit(task.id, {checklist: 'nope' as never})).rejects.toThrow(ThreadError);
	});
});

describe('the fields older clients send', () => {
	it('are refused with a word to restart, changing nothing', async () => {
		const task = await tasks.add({title: 'Call the landlord'});
		for (const old of [{state: 'done'}, {place: 'today'}, {date: '2026-10-20'}, {done: true}]) {
			await expect(tasks.edit(task.id, old as never)).rejects.toThrow('Restart the Session or reload the page');
		}
		await expect(tasks.add({title: 'Pay rent', place: 'today'} as never)).rejects.toThrow('Restart the Session');
		expect(await tasks.list()).toEqual([task]);
	});
});

describe('the Logbook', () => {
	it('lists Done and Dropped Tasks, the most recently ended first', async () => {
		let clock = new Date('2026-10-18T09:00:00');
		const timed = new Tasks(storage, () => clock);
		const card = await timed.add({title: 'Buy a card'});
		const bins = await timed.add({title: 'Put the bins out'});
		await timed.add({title: 'Still open'});
		await timed.edit(card.id, {ended: 'done'});
		clock = new Date('2026-10-18T10:00:00');
		await timed.edit(bins.id, {ended: 'dropped'});
		expect((await timed.logbook()).map(t => [t.title, t.ended])).toEqual([
			['Put the bins out', 'dropped'],
			['Buy a card', 'done'],
		]);
		await timed.edit(card.id, {ended: 'not_ended'});
		expect((await timed.logbook()).map(t => t.title)).toEqual(['Put the bins out']);
	});
});

describe('turning a Task into a Thread', () => {
	it('makes a Thread with its title and Notes, its steps as linked Tasks, and the Task gone', async () => {
		const party = await threads.create({title: 'Plan a party'});
		const task = await tasks.add({
			title: 'Book a venue',
			when: {kind: 'today'},
			notes: 'Somewhere near the station',
			checklist: [{title: 'Ring the pub'}, {title: 'Ask Jo', done: true}],
		});
		const thread = await tasks.turnIntoThread(task.id, party.id, threads);
		expect(thread).toMatchObject({title: 'Book a venue', notes: 'Somewhere near the station', parentId: party.id, whoseMove: 'on_me', when: {kind: 'active'}, ended: 'not_ended'});
		await expect(tasks.get(task.id)).rejects.toThrow(ThreadError);
		expect((await tasks.list()).map(t => [t.title, t.when, t.threadId])).toEqual([['Ring the pub', {kind: 'anytime'}, thread.id]]);
		expect((await tasks.logbook()).map(t => [t.title, t.threadId])).toEqual([['Ask Jo', thread.id]]);
	});

	it('hands over its Deadline, and makes its list or Date the Thread’s When', async () => {
		const into = async (task: Promise<{id: string}>) => tasks.turnIntoThread((await task).id, null, threads);
		const booked = await into(tasks.add({title: 'Book a venue', when: {kind: 'today'}, deadline: {kind: 'by_day', day: '2026-11-01'}}));
		expect(booked).toMatchObject({when: {kind: 'active'}, deadline: {kind: 'by_day', day: '2026-11-01'}});
		for (const kind of ['inbox', 'anytime'] as const) expect((await into(tasks.add({title: kind, when: {kind}}))).when).toEqual({kind: 'active'});
		expect(await into(tasks.add({title: 'Learn to sail', when: {kind: 'someday'}}))).toMatchObject({when: {kind: 'someday'}, deadline: {kind: 'none'}});
		expect((await into(tasks.add({title: 'Do the tax return', when: {kind: 'on_day', day: '2027-04-06'}}))).when).toEqual({kind: 'on_day', day: '2027-04-06'});
		// A Date that has come puts the Task in Today, so the Thread is Active.
		expect((await into(tasks.add({title: 'Pay the bill', when: {kind: 'on_day', day: '2020-01-01'}}))).when).toEqual({kind: 'active'});
	});

	// The hosted Instance allows 50 queries a request, and a batch can turn
	// several Tasks into Threads in one. Each storage call is one query.
	let calls = 0;
	const counted = () => new Proxy(storage, {
		get: (target, name) => {
			const value = Reflect.get(target, name);
			return typeof value === 'function' ? (...args: unknown[]) => (calls++, value.apply(target, args)) : value;
		},
	});

	it('writes all its steps in one query, however long the checklist', async () => {
		const queries = async (steps: number) => {
			const task = await tasks.add({title: `${steps} steps`, checklist: Array.from({length: steps}, (_, n) => ({title: `Step ${n}`, done: n === 0}))});
			calls = 0;
			await new Tasks(counted(), () => new Date('2026-10-18T09:00:00')).turnIntoThread(task.id, null, new Threads(counted()));
			return calls;
		};
		const one = await queries(1);
		expect(await queries(30)).toBe(one);
		expect(one).toBeLessThanOrEqual(10);
		expect((await tasks.list()).filter(t => t.title.startsWith('Step')).length).toBe(29);
		expect((await tasks.logbook()).map(t => t.title)).toEqual(['Step 0', 'Step 0']);
	});

	it('fits a full batch with four turns of long checklists and typical changes within 50 queries', async () => {
		const thread = await threads.create({title: 'Plan a party'});
		const ids = [];
		for (const n of [1, 2, 3, 4]) ids.push((await tasks.add({title: `Task ${n}`, checklist: Array.from({length: 20}, (_, s) => ({title: `Step ${s}`}))})).id);
		const others = Array.from({length: batchLimit - turnsIntoThreadsLimit}, (_, n) => ({method: 'PATCH', path: `/api/threads/${thread.id}`, body: {title: `Plan ${n}`}}));
		const store = counted();
		const handle = createHandler(new Threads(store), new Tasks(store), new Thoughts(store), new Projects(store));
		calls = 0;
		const response = await handle(new Request('http://localhost/api/batch', {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({requests: [...ids.map(id => ({method: 'POST', path: `/api/tasks/${id}/thread`, body: {}})), ...others]}),
		}));
		const {results} = await response.json() as {results: Array<{status: number}>};
		expect(results.map(result => result.status)).toEqual(Array(batchLimit).fill(200));
		expect(calls).toBeLessThanOrEqual(50);
	});

	it('puts the new Thread at the top level when given no parent', async () => {
		const task = await tasks.add({title: 'Fix the boiler'});
		expect((await tasks.turnIntoThread(task.id, null, threads)).parentId).toBeNull();
	});

	it('refuses a Task that has ended, and a parent that does not exist, leaving the Task', async () => {
		const done = await tasks.add({title: 'Done already'});
		await tasks.edit(done.id, {ended: 'done'});
		await expect(tasks.turnIntoThread(done.id, null, threads)).rejects.toThrow(ThreadError);
		const open = await tasks.add({title: 'Still here'});
		await expect(tasks.turnIntoThread(open.id, 'no-such-thread', threads)).rejects.toThrow(ThreadError);
		expect((await tasks.list()).map(t => t.title)).toEqual(['Still here']);
		expect(await threads.list()).toEqual([]);
	});
});

describe('the change number', () => {
	it('goes up with every change to a Thread or a Task, and only then', async () => {
		const before = await threads.changeNumber();
		await threads.list();
		await tasks.list();
		expect(await threads.changeNumber()).toBe(before);
		const thread = await threads.create({title: 'Move house'});
		const afterThread = await threads.changeNumber();
		expect(afterThread).toBeGreaterThan(before);
		const task = await tasks.add({title: 'Pack', threadId: thread.id});
		await tasks.edit(task.id, {title: 'Pack the kitchen'});
		const afterTask = await threads.changeNumber();
		expect(afterTask).toBeGreaterThan(afterThread);
		await tasks.turnIntoThread(task.id, null, threads);
		expect(await threads.changeNumber()).toBeGreaterThan(afterTask);
	});
});

describe('a list grouped by project and area', () => {
	it('shows Tasks that belong nowhere first, then each project and area in the sidebar\'s order, grouped by Thread inside', async () => {
		const projects = new Projects(storage);
		const software = await projects.createArea({title: 'Software'});
		const health = await projects.createArea({title: 'Health'});
		const todos = await projects.createProject({title: 'Build todos', area: {kind: 'in', id: software.id}});
		const flat = await projects.createProject({title: 'Move flat'});
		const ui = await threads.create({title: 'Build the UI', belongs: {kind: 'project', id: todos.id}});
		await tasks.add({title: 'Buy milk', when: {kind: 'today'}});
		await tasks.add({title: 'Fix the menu', when: {kind: 'today'}, threadId: ui.id});
		await tasks.add({title: 'Book a run', when: {kind: 'today'}, belongs: {kind: 'area', id: health.id}});
		await tasks.add({title: 'Pack boxes', when: {kind: 'today'}, belongs: {kind: 'project', id: flat.id}});
		await tasks.add({title: 'Write the docs', when: {kind: 'today'}, belongs: {kind: 'project', id: todos.id}});
		await projects.editProject(flat.id, {ended: 'done'});
		expect(await shown('today')).toEqual([
			'Buy milk',
			'== Move flat (done) ==', 'Pack boxes',
			'== Software › Build todos ==', 'Write the docs', '-- Build the UI --', 'Fix the menu',
			'== Health ==', 'Book a run',
		]);
	});
});
