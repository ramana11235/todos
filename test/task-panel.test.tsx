import {render} from 'ink-testing-library';
import {act} from 'react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {Client} from '../src/client/client.js';
import type {List} from '../src/core/task.js';
import {TaskPanel} from '../src/home/task-panel.js';
import {startApi} from './support.js';

let client: Client;
let stop: () => Promise<void>;
let house: string;
let kitchen: string;
let current: string | null;
let saved: List[];
let work: Promise<unknown>[];

// React draws inside act() as soon as the work it waits for is done, so a
// frame read after it is settled.
(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

// Waits for every piece of work the panel has started, including any it
// starts while finishing earlier work, and for React to draw the result.
const settled = () =>
	act(async () => {
		while (work.length) await work.shift();
	});

// The panel never polls here, so every change a test sees comes from work
// it waited for.
const show = async () => {
	const panel = await act(async () =>
		render(<TaskPanel client={client} currentThread={() => current} initialList="today" saveList={list => saved.push(list)} pollMs={2 ** 30}
			onWork={started => work.push(started)} />));
	await settled();
	return panel;
};

const keys = async (stdin: {write: (data: string) => void}, ...presses: string[]) => {
	for (const press of presses) {
		await act(async () => {
			stdin.write(press);
		});
		await settled();
	}
};

// The lines between the list names and the hints, trimmed.
const body = (frame: string) => frame.split('\n').slice(2).map(line => line.trim()).filter(line => line && !line.includes(' · '));

beforeEach(async () => {
	({client, stop} = await startApi());
	current = null;
	saved = [];
	work = [];
	house = (await client.create('Move house')).id;
	kitchen = (await client.create('Pack the kitchen', house)).id;
	await client.create('Build todos');
	await client.addTask({title: 'Book the dentist', when: {kind: 'today'}});
	await client.addTask({title: 'Buy bubble wrap', when: {kind: 'today'}, threadId: kitchen});
	await client.addTask({title: 'Ask about the deposit', when: {kind: 'today'}, threadId: house});
	await client.addTask({title: 'Call the landlord'});
});

afterEach(() => stop());

describe('the task panel', () => {
	it('shows the list names, then Tasks with no Thread, then a group per Thread in tree order', async () => {
		const {lastFrame, unmount} = await show();
		expect(lastFrame()).toContain('Inbox  Today  Anytime  Upcoming  Someday');
		expect(body(lastFrame()!)).toEqual([
			'○ Book the dentist',
			'-- Move house --', '○ Ask about the deposit',
			'-- Pack the kitchen --', '○ Buy bubble wrap',
		]);
		unmount();
	});

	it('switches lists with Tab and Shift+Tab and remembers the list', async () => {
		const {lastFrame, stdin, unmount} = await show();
		await keys(stdin, '\u001b[Z');
		expect(body(lastFrame()!)).toEqual(['○ Call the landlord']);
		await keys(stdin, '\t', '\t');
		expect(body(lastFrame()!)).toEqual(['Nothing here']);
		expect(saved).toEqual(['inbox', 'today', 'anytime']);
		unmount();
	});

	it('keeps a ticked Task in view until the list changes, and unticks it with Enter again', async () => {
		const {lastFrame, stdin, unmount} = await show();
		await keys(stdin, '\r');
		expect(body(lastFrame()!)[0]).toBe('● Book the dentist');
		await keys(stdin, '\r');
		expect((await client.tasks()).map(t => t.title)).toContain('Book the dentist');
		await keys(stdin, '\r', '\t', '\u001b[Z');
		expect(body(lastFrame()!)).not.toContain('● Book the dentist');
		expect((await client.tasks()).map(t => t.title)).not.toContain('Book the dentist');
		unmount();
	});

	it('adds a Task right after the selected one, under the same Thread', async () => {
		const {lastFrame, stdin, unmount} = await show();
		await keys(stdin, 'j', 'a', 'Bring boxes', '\r');
		expect(body(lastFrame()!)).toEqual([
			'○ Book the dentist',
			'-- Move house --', '○ Ask about the deposit', '○ Bring boxes',
			'-- Pack the kitchen --', '○ Buy bubble wrap',
		]);
		expect((await client.tasks()).find(t => t.title === 'Bring boxes')?.threadId).toBe(house);
		unmount();
	});

	it('renames, reorders and searches', async () => {
		const {lastFrame, stdin, unmount} = await show();
		await keys(stdin, 'r', '\u0015', 'Book the optician', '\r');
		expect(body(lastFrame()!)[0]).toBe('○ Book the optician');
		await keys(stdin, '/', 'wrap', '\r', 'r', '\u0015', 'Buy more bubble wrap', '\r');
		expect(body(lastFrame()!)).toContain('○ Buy more bubble wrap');
		unmount();
	});

	it('puts Upcoming under a heading for each day, grouped by Thread within the day', async () => {
		await client.addTask({title: 'Collect the van', when: {kind: 'on_day', day: '2099-01-10'}, threadId: house});
		await client.addTask({title: 'Ring the bank', when: {kind: 'on_day', day: '2099-01-03'}});
		await client.addTask({title: 'Wrap the glasses', when: {kind: 'on_day', day: '2099-01-03'}, threadId: kitchen});
		const {lastFrame, stdin, unmount} = await show();
		await keys(stdin, '\t', '\t');
		expect(body(lastFrame()!)).toEqual([
			'3 Jan', '○ Ring the bank', '-- Pack the kitchen --', '○ Wrap the glasses',
			'10 Jan', '-- Move house --', '○ Collect the van',
		]);
		unmount();
	});

	it('filters to the current Thread and the Threads below it', async () => {
		current = house;
		const {lastFrame, stdin, unmount} = await show();
		await keys(stdin, 'f');
		expect(lastFrame()).toContain('Only Move house');
		expect(body(lastFrame()!).slice(1)).toEqual(['-- Move house --', '○ Ask about the deposit', '-- Pack the kitchen --', '○ Buy bubble wrap']);
		unmount();
	});
});
