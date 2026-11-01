import {beforeEach, describe, expect, it} from 'vitest';
import {childrenOf, directoryOf, shownMove, treeRows, type Thread, type View} from '../src/core/thread.js';
import {ThreadError, Threads} from '../src/core/threads.js';
import type {Storage} from '../src/storage/storage.js';
import {makeStorage} from './support.js';

let storage: Storage;
let threads: Threads;
let clock: number;

beforeEach(async () => {
	clock = Date.parse('2026-10-17T09:00:00Z');
	storage = await makeStorage();
	threads = new Threads(storage, () => new Date((clock += 1000)));
});

const today = '2026-10-17';

const titles = async (view: View = 'active') =>
	treeRows(await threads.list(), {view, today}).map(row => `${'  '.repeat(row.depth)}${row.thread.title}${row.dimmed ? ' (dim)' : ''}`);

describe('creating and arranging Threads', () => {
	it('creates a Thread with only a title, On me and with nothing else set', async () => {
		const thread = await threads.create({title: '  Move house '});
		expect(thread).toMatchObject({title: 'Move house', whoseMove: 'on_me', when: {kind: 'active'}, ended: 'not_ended', deadline: {kind: 'none'}, summary: '', nextStep: '', notes: '', parentId: null});
	});

	it('refuses a Thread with no title', async () => {
		await expect(threads.create({title: '   '})).rejects.toThrow(ThreadError);
	});

	it('nests children under their parent in the order they were made', async () => {
		const launch = await threads.create({title: 'Launch v1'});
		await threads.create({title: 'Build the MCP server', parentId: launch.id});
		await threads.create({title: 'Build the TUI', parentId: launch.id});
		await threads.create({title: 'Move house'});
		expect(await titles()).toEqual(['Launch v1', '  Build the MCP server', '  Build the TUI', 'Move house']);
	});

	it('puts a new Thread straight after a sibling when asked', async () => {
		const a = await threads.create({title: 'A'});
		const b = await threads.create({title: 'B'});
		await threads.create({title: 'C'});
		await threads.create({title: 'After A', afterId: a.id});
		expect(await titles()).toEqual(['A', 'After A', 'B', 'C']);
		await expect(threads.create({title: 'Under B', parentId: b.id, afterId: a.id})).rejects.toThrow(ThreadError);
	});

	it('puts a new Thread at a place among its siblings when asked', async () => {
		await threads.create({title: 'A'});
		await threads.create({title: 'B'});
		await threads.create({title: 'First', index: 0});
		await threads.create({title: 'Second', index: 1});
		expect(await titles()).toEqual(['First', 'Second', 'A', 'B']);
	});

	it('reorders only when asked, among siblings', async () => {
		const a = await threads.create({title: 'A'});
		await threads.create({title: 'B'});
		const c = await threads.create({title: 'C'});
		await threads.reorder(c.id, 'up');
		expect(await titles()).toEqual(['A', 'C', 'B']);
		await threads.reorder(a.id, 'up');
		expect(await titles()).toEqual(['A', 'C', 'B']);
		await threads.reorder(a.id, 'down');
		expect(await titles()).toEqual(['C', 'A', 'B']);
	});

	// Two Sessions making Threads under one parent at the same moment can
	// give both the same position.
	it('keeps two Threads with the same position in the order they were made', async () => {
		const a = await threads.create({title: 'A'});
		const b = await threads.create({title: 'B'});
		await storage.updateThread(b.id, {position: a.position});
		expect(childrenOf([await threads.get(b.id), await threads.get(a.id)], null).map(t => t.title)).toEqual(['A', 'B']);
		await threads.reorder(b.id, 'up');
		expect(await titles()).toEqual(['B', 'A']);
		await threads.reorder(b.id, 'down');
		expect(await titles()).toEqual(['A', 'B']);
	});

	it('moves a Thread under another parent, or to the top level', async () => {
		const launch = await threads.create({title: 'Launch v1'});
		const house = await threads.create({title: 'Move house'});
		await threads.move(house.id, launch.id);
		expect(await titles()).toEqual(['Launch v1', '  Move house']);
		await threads.move(house.id, null);
		expect(await titles()).toEqual(['Launch v1', 'Move house']);
	});

	it('refuses to move a Thread under itself or its own children', async () => {
		const launch = await threads.create({title: 'Launch v1'});
		const child = await threads.create({title: 'Child', parentId: launch.id});
		await expect(threads.move(launch.id, launch.id)).rejects.toThrow(ThreadError);
		await expect(threads.move(launch.id, child.id)).rejects.toThrow(ThreadError);
	});

	it('moves a Thread to a given place among its new siblings, or among its own', async () => {
		const launch = await threads.create({title: 'Launch v1'});
		await threads.create({title: 'Build the MCP server', parentId: launch.id});
		await threads.create({title: 'Build the TUI', parentId: launch.id});
		const house = await threads.create({title: 'Move house'});
		await threads.move(house.id, launch.id, 1);
		expect(await titles()).toEqual(['Launch v1', '  Build the MCP server', '  Move house', '  Build the TUI']);
		await threads.move(house.id, launch.id, 0);
		expect(await titles()).toEqual(['Launch v1', '  Move house', '  Build the MCP server', '  Build the TUI']);
	});
});

describe('editing by hand', () => {
	it('edits the title, Summary, Next step, whose move, When, Ended and Deadline', async () => {
		const thread = await threads.create({title: 'Move house'});
		const edited = await threads.edit(thread.id, {
			title: 'Move to Leeds',
			summary: 'Two quotes in.',
			nextStep: 'Waiting on the landlord',
			whoseMove: 'waiting',
			when: {kind: 'on_day', day: '2026-11-02'},
			deadline: {kind: 'by_day', day: '2026-12-01'},
		});
		const expected = {title: 'Move to Leeds', summary: 'Two quotes in.', nextStep: 'Waiting on the landlord', whoseMove: 'waiting', when: {kind: 'on_day', day: '2026-11-02'}, deadline: {kind: 'by_day', day: '2026-12-01'}};
		expect(edited).toMatchObject(expected);
		expect(await threads.get(thread.id)).toMatchObject(expected);
		expect(await threads.edit(thread.id, {ended: 'done', deadline: {kind: 'none'}})).toMatchObject({ended: 'done', deadline: {kind: 'none'}});
		expect(await threads.get(thread.id)).toMatchObject({ended: 'done', deadline: {kind: 'none'}});
	});

	it('refuses a whose move, When, Ended or Deadline that is not one of its cases', async () => {
		const thread = await threads.create({title: 'Move house'});
		for (const edit of [{whoseMove: 'working'}, {when: {kind: 'on_day', day: '2026-02-30'}}, {when: null}, {ended: 'open'}, {deadline: {kind: 'by_day'}}]) {
			await expect(threads.edit(thread.id, edit as any)).rejects.toThrow(ThreadError);
		}
	});

	it('refuses the state older clients send with a word to restart, changing nothing', async () => {
		const thread = await threads.create({title: 'Move house'});
		await expect(threads.edit(thread.id, {state: 'someday'} as never)).rejects.toThrow('Restart the Session or reload the page');
		await expect(threads.sessionUpdate(thread.id, {summary: 'Done.', state: 'done'} as never)).rejects.toThrow('Restart the Session');
		expect(await threads.get(thread.id)).toEqual(thread);
	});

	it('records when the summary or next step last changed', async () => {
		let now = new Date('2026-10-17T09:00:00Z');
		const timed = new Threads(await makeStorage(), () => now);
		const thread = await timed.create({title: 'Move house'});
		expect(thread.summaryUpdatedAt).toBeNull();
		await timed.edit(thread.id, {summary: 'Two quotes in.'});
		now = new Date('2026-10-17T10:00:00Z');
		expect((await timed.edit(thread.id, {when: {kind: 'someday'}, title: 'Move to Leeds'})).summaryUpdatedAt).toBe('2026-10-17T09:00:00.000Z');
		await timed.edit(thread.id, {when: {kind: 'active'}});
		now = new Date('2026-10-17T11:00:00Z');
		await timed.sessionView(thread.id);
		const view = await timed.sessionUpdate(thread.id, {summary: 'Two quotes in.', nextStep: 'Call the third company', whoseMove: 'on_me'});
		expect(view.thread.summaryUpdatedAt).toBe('2026-10-17T11:00:00.000Z');
	});
});

describe('what Home shows', () => {
	it('keeps one ended Thread in view when asked to', async () => {
		const done = await threads.create({title: 'Done'});
		await threads.edit(done.id, {ended: 'done'});
		expect(treeRows(await threads.list(), {view: 'active', today, keep: new Set([done.id])}).map(row => [row.thread.title, row.dimmed])).toEqual([['Done', true]]);
	});

	it('shows Active Threads, adds the ones I could bring in, and shows ended ones on their own', async () => {
		await threads.create({title: 'Active'});
		const someday = await threads.create({title: 'Someday'});
		await threads.edit(someday.id, {when: {kind: 'someday'}});
		const later = await threads.create({title: 'Later'});
		await threads.edit(later.id, {when: {kind: 'on_day', day: '2026-11-02'}});
		for (const ended of ['done', 'dropped'] as const) {
			const thread = await threads.create({title: ended});
			await threads.edit(thread.id, {ended});
		}
		expect(await titles()).toEqual(['Active']);
		expect(await titles('bring_in')).toEqual(['Active', 'Someday (dim)', 'Later (dim)']);
		expect(await titles('ended')).toEqual(['done', 'dropped']);
		expect(await titles('all')).toEqual(['Active', 'Someday (dim)', 'Later (dim)', 'done (dim)', 'dropped (dim)']);
	});

	it('shows a Thread with a day as Active from that day on', async () => {
		const later = await threads.create({title: 'Later'});
		await threads.edit(later.id, {when: {kind: 'on_day', day: today}});
		expect(await titles()).toEqual(['Later']);
		await threads.edit(later.id, {when: {kind: 'on_day', day: '2026-10-18'}});
		expect(await titles()).toEqual([]);
	});

	it('shows an ended Thread dimmed when an open Thread sits below it, and leaves the child alone', async () => {
		const launch = await threads.create({title: 'Launch v1'});
		const landing = await threads.create({title: 'Landing page', parentId: launch.id});
		const done = await threads.create({title: 'Done child', parentId: launch.id});
		await threads.edit(done.id, {ended: 'done'});
		await threads.edit(launch.id, {ended: 'done'});
		expect(await titles()).toEqual(['Launch v1 (dim)', '  Landing page']);
		expect((await threads.get(landing.id)).ended).toBe('not_ended');
	});

	it('reopens an ended Thread as it was', async () => {
		const thread = await threads.create({title: 'Launch v1'});
		await threads.edit(thread.id, {whoseMove: 'waiting', ended: 'dropped'});
		await threads.edit(thread.id, {ended: 'not_ended'});
		expect(await titles()).toEqual(['Launch v1']);
		expect((await threads.get(thread.id)).whoseMove).toBe('waiting');
	});

	it('never works out a parent whose move from its children', async () => {
		const launch = await threads.create({title: 'Launch v1'});
		const child = await threads.create({title: 'Child', parentId: launch.id});
		await threads.edit(child.id, {whoseMove: 'waiting'});
		await threads.edit(launch.id, {whoseMove: 'waiting'});
		await threads.edit(child.id, {whoseMove: 'on_me'});
		expect(shownMove(await threads.get(launch.id))).toBe('waiting');
	});
});

describe('Directories', () => {
	it('uses the nearest ancestor Directory unless a Thread sets its own', async () => {
		const launch = await threads.create({title: 'Launch v1'});
		const mcp = await threads.create({title: 'MCP', parentId: launch.id});
		const deep = await threads.create({title: 'Deep', parentId: mcp.id});
		const all = async () => threads.list();
		expect(directoryOf(await all(), deep.id)).toBeNull();
		await threads.edit(launch.id, {directory: '/work/todos'});
		expect(directoryOf(await all(), deep.id)).toBe('/work/todos');
		await threads.edit(mcp.id, {directory: '/work/mcp'});
		expect(directoryOf(await all(), deep.id)).toBe('/work/mcp');
		expect(directoryOf(await all(), launch.id)).toBe('/work/todos');
	});
});

describe('whose move from the Session', () => {
	const shown = async (id: string) => shownMove(await threads.get(id));

	it('is Working while busy, On me while asking, and the set whose move once the turn finishes', async () => {
		const thread = await threads.create({title: 'MCP'});
		await threads.edit(thread.id, {whoseMove: 'waiting'});
		await threads.signal(thread.id, 'busy');
		expect(await shown(thread.id)).toBe('working');
		await threads.signal(thread.id, 'asking');
		expect(await shown(thread.id)).toBe('on_me');
		await threads.signal(thread.id, 'busy');
		await threads.sessionUpdate(thread.id, {summary: 'Typo fixed.', nextStep: 'Wait for CI', whoseMove: 'waiting'});
		await threads.signal(thread.id, 'finished');
		expect(await shown(thread.id)).toBe('waiting');
	});

	it('keeps the last whose move when the Session has gone', async () => {
		const thread = await threads.create({title: 'MCP'});
		await threads.signal(thread.id, 'busy');
		await threads.signal(thread.id, null);
		expect(await shown(thread.id)).toBe('on_me');
	});

	it('lets the Session end or park its Thread when I tell it to', async () => {
		const thread = await threads.create({title: 'Dotfiles'});
		await threads.sessionView(thread.id);
		const {thread: ended} = await threads.sessionUpdate(thread.id, {summary: 'Shipped.', nextStep: 'Nothing', ended: 'done', when: {kind: 'someday'}});
		expect(ended).toMatchObject({ended: 'done', when: {kind: 'someday'}});
	});
});

describe('Notes', () => {
	it('are rewritten whole, or changed a passage at a time, and kept', async () => {
		const thread = await threads.create({title: 'Move house'});
		await threads.sessionUpdate(thread.id, {notes: 'Quotes: two in.\nVan: not booked.'});
		await threads.sessionUpdate(thread.id, {noteEdits: [{old: 'two in', new: 'three in'}, {old: 'not booked', new: 'booked for Friday'}]});
		expect((await threads.get(thread.id)).notes).toBe('Quotes: three in.\nVan: booked for Friday.');
		await threads.sessionUpdate(thread.id, {notes: 'Moved.', noteEdits: [{old: 'Moved', new: 'Moved in'}]});
		expect((await threads.get(thread.id)).notes).toBe('Moved in.');
	});

	it('save nothing when an edit names text that is missing or there more than once', async () => {
		const thread = await threads.create({title: 'Move house'});
		await threads.sessionUpdate(thread.id, {notes: 'Box one. Box two.'});
		for (const old of ['Box three', 'Box', '']) {
			await expect(threads.sessionUpdate(thread.id, {summary: 'Changed.', noteEdits: [{old: 'one', new: '1'}, {old, new: 'x'}]})).rejects.toThrow(ThreadError);
		}
		await expect(threads.edit(thread.id, {noteEdits: [{old: 'Box', new: 'x'}]})).rejects.toThrow(ThreadError);
		expect(await threads.get(thread.id)).toMatchObject({notes: 'Box one. Box two.', summary: '', myEditAt: null});
	});

	it('count as my edit when I change them, so the Session keeps my version', async () => {
		const thread = await threads.create({title: 'Move house'});
		await threads.sessionUpdate(thread.id, {notes: 'Its notes.'});
		await threads.edit(thread.id, {noteEdits: [{old: 'Its', new: 'My'}]});
		expect(await threads.sessionUpdate(thread.id, {notes: 'Its again.'})).toMatchObject({updated: false, thread: {notes: 'My notes.'}});
	});
});

describe('what a Session sees', () => {
	it('changes only what a Session names on its own Thread, such as its title', async () => {
		const thread = await threads.create({title: 'Move house'});
		await threads.sessionUpdate(thread.id, {summary: 'Two quotes in.', nextStep: 'Call the third', whoseMove: 'waiting'});
		const {thread: renamed} = await threads.sessionUpdate(thread.id, {title: 'Move to Leeds'});
		expect(renamed).toMatchObject({title: 'Move to Leeds', summary: 'Two quotes in.', nextStep: 'Call the third', whoseMove: 'waiting', myEditAt: null});
	});

	it('has its update refused once when I edited the Thread since it last saw it, and is shown my version', async () => {
		const thread = await threads.create({title: 'MCP'});
		await threads.sessionView(thread.id);
		await threads.edit(thread.id, {summary: 'My version.'});
		const refused = await threads.sessionUpdate(thread.id, {summary: 'Its version.', nextStep: 'Two', whoseMove: 'on_me'});
		expect(refused).toMatchObject({updated: false, thread: {summary: 'My version.'}});
		const accepted = await threads.sessionUpdate(thread.id, {summary: 'My version, and more.', nextStep: 'Two', whoseMove: 'on_me'});
		expect(accepted).toMatchObject({updated: true, thread: {summary: 'My version, and more.'}});
	});

	it('is told when I edited its Thread after its last update', async () => {
		const thread = await threads.create({title: 'MCP'});
		await threads.sessionUpdate(thread.id, {summary: 'One.', nextStep: 'Two', whoseMove: 'on_me'});
		expect((await threads.sessionView(thread.id)).editedByMeSinceYourLastUpdate).toBe(false);
		await threads.edit(thread.id, {summary: 'My version.'});
		const view = await threads.sessionView(thread.id);
		expect(view.editedByMeSinceYourLastUpdate).toBe(true);
		expect(view.thread.summary).toBe('My version.');
	});
});

describe('folding on Home', () => {
	it('hides what is below a folded Thread and says how much, and whether any of it is On me', async () => {
		const launch = await threads.create({title: 'Launch v1'});
		const mcp = await threads.create({title: 'MCP', parentId: launch.id});
		await threads.create({title: 'Schema', parentId: mcp.id});
		await threads.edit(mcp.id, {whoseMove: 'waiting'});
		await threads.create({title: 'Move house'});
		const rows = treeRows(await threads.list(), {view: 'active', today, folded: new Set([launch.id])});
		expect(rows.map(row => row.thread.title)).toEqual(['Launch v1', 'Move house']);
		expect(rows[0]!.folded).toEqual({hidden: 2, onMeBelow: true});
		expect(rows[1]!.folded).toBeNull();
	});

	it('ignores a fold on a Thread with nothing shown below it', async () => {
		const house = await threads.create({title: 'Move house'});
		const rows = treeRows(await threads.list(), {view: 'active', today, folded: new Set([house.id])});
		expect(rows[0]!.folded).toBeNull();
	});
});

describe('changes that arrive at the same time', () => {
	// The hosted Instance runs requests side by side, so a hook can read a
	// Thread while a Session is saving it.
	it('keeps both a hook signal and a Session update made together', async () => {
		const thread = await threads.create({title: 'Host todos'});
		await Promise.all([
			threads.signal(thread.id, 'busy'),
			threads.sessionUpdate(thread.id, {notes: 'New notes', summary: 'New summary'}),
			threads.recordSession(thread.id, {sessionPane: '%3'}),
		]);
		expect(await threads.get(thread.id)).toMatchObject({
			notes: 'New notes',
			summary: 'New summary',
			sessionSignal: 'busy',
			sessionPane: '%3',
		});
	});

	it('keeps both a hook signal and my rename made together', async () => {
		const a = await threads.create({title: 'A'});
		await threads.create({title: 'B'});
		await Promise.all([threads.signal(a.id, 'busy'), threads.edit(a.id, {title: 'A renamed'})]);
		expect(await threads.get(a.id)).toMatchObject({title: 'A renamed', sessionSignal: 'busy'});
	});
});
