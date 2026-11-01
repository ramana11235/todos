import {beforeEach, describe, expect, it} from 'vitest';
import {treeRows} from '../src/core/thread.js';
import {Threads} from '../src/core/threads.js';
import {columnsFor, moved} from '../web/src/columns.js';
import {makeStorage} from './support.js';

let threads: Threads;

beforeEach(async () => {
	threads = new Threads(await makeStorage());
});

// Each column as its titles, with the selected one marked.
const columns = async (selectedId: string | null, showAll = false) =>
	columnsFor(treeRows(await threads.list(), {view: showAll ? 'all' : 'active', today: '2026-10-17'}), selectedId).map(column =>
		column.rows.map(row => (row.thread.id === column.selectedId ? `[${row.thread.title}]` : row.thread.title)),
	);

describe('the columns of the Threads page', () => {
	it('shows only the top level when nothing is selected', async () => {
		const party = await threads.create({title: 'Plan a party'});
		await threads.create({title: 'Book a venue', parentId: party.id});
		await threads.create({title: 'Fix the boiler'});
		expect(await columns(null)).toEqual([['Plan a party', 'Fix the boiler']]);
	});

	it('opens a column for each selected Thread down to the one picked', async () => {
		const party = await threads.create({title: 'Plan a party'});
		const venue = await threads.create({title: 'Book a venue', parentId: party.id});
		await threads.create({title: 'Ring the pub', parentId: venue.id});
		await threads.create({title: 'Sort the guests', parentId: party.id});
		await threads.create({title: 'Fix the boiler'});
		expect(await columns(venue.id)).toEqual([['[Plan a party]', 'Fix the boiler'], ['[Book a venue]', 'Sort the guests'], ['Ring the pub']]);
	});

	it('adds no column under a selected Thread with no children', async () => {
		await threads.create({title: 'Plan a party'});
		const boiler = await threads.create({title: 'Fix the boiler'});
		expect(await columns(boiler.id)).toEqual([['Plan a party', '[Fix the boiler]']]);
	});

	it('hides what Home hides, and shows all when asked', async () => {
		const party = await threads.create({title: 'Plan a party'});
		const old = await threads.create({title: 'Old ideas', parentId: party.id});
		await threads.edit(old.id, {when: {kind: 'someday'}});
		expect(await columns(party.id)).toEqual([['[Plan a party]']]);
		expect(await columns(party.id, true)).toEqual([['[Plan a party]'], ['Old ideas']]);
	});
});

describe('showing a move before the API has made it', () => {
	const order = (list: Awaited<ReturnType<Threads['list']>>, parentId: string | null) =>
		list.filter(t => t.parentId === parentId).sort((a, b) => a.position - b.position).map(t => t.title);

	it('matches what the API does when a Thread moves to another parent', async () => {
		const a = await threads.create({title: 'A'});
		const b = await threads.create({title: 'B'});
		await threads.create({title: 'B1', parentId: b.id});
		await threads.create({title: 'B2', parentId: b.id});
		const local = moved(await threads.list(), a.id, b.id, 1);
		await threads.move(a.id, b.id, 1);
		const real = await threads.list();
		expect(order(local, b.id)).toEqual(order(real, b.id));
		expect(order(local, null)).toEqual(order(real, null));
		expect(order(local, b.id)).toEqual(['B1', 'A', 'B2']);
	});

	it('matches what the API does when a Thread moves down among its siblings', async () => {
		const a = await threads.create({title: 'A'});
		await threads.create({title: 'B'});
		await threads.create({title: 'C'});
		const local = moved(await threads.list(), a.id, null, 2);
		await threads.move(a.id, null, 2);
		expect(order(local, null)).toEqual(order(await threads.list(), null));
		expect(order(local, null)).toEqual(['B', 'C', 'A']);
	});
});
