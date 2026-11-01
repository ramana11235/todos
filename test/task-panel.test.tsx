import {render} from 'ink-testing-library';
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

const settle = () => new Promise(resolve => setTimeout(resolve, 200));

const show = () =>
	render(<TaskPanel client={client} currentThread={() => current} initialList="today" saveList={list => saved.push(list)} pollMs={50} />);

const keys = async (stdin: {write: (data: string) => void}, ...presses: string[]) => {
	await settle();
	for (const press of presses) {
		stdin.write(press);
		await settle();
	}
};

// The lines between the list names and the hints, trimmed.
const body = (frame: string) => frame.split('\n').slice(2).map(line => line.trim()).filter(line => line && !line.includes(' · '));

beforeEach(async () => {
	({client, stop} = await startApi());
	current = null;
	saved = [];
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
		const {lastFrame, unmount} = show();
		await settle();
		expect(lastFrame()).toContain('Inbox  Today  Anytime  Upcoming  Someday');
		expect(body(lastFrame()!)).toEqual([
			'○ Book the dentist',
			'-- Move house --', '○ Ask about the deposit',
			'-- Pack the kitchen --', '○ Buy bubble wrap',
		]);
		unmount();
	});

	it('switches lists with Tab and Shift+Tab and remembers the list', async () => {
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, '\u001b[Z');
		expect(body(lastFrame()!)).toEqual(['○ Call the landlord']);
		await keys(stdin, '\t', '\t');
		expect(body(lastFrame()!)).toEqual(['Nothing here']);
		expect(saved).toEqual(['inbox', 'today', 'anytime']);
		unmount();
	});

	it('keeps a ticked Task in view until the list changes, and unticks it with Enter again', async () => {
		const {lastFrame, stdin, unmount} = show();
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
		const {lastFrame, stdin, unmount} = show();
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
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, 'r', '\u0015', 'Book the optician', '\r');
		expect(body(lastFrame()!)[0]).toBe('○ Book the optician');
		await keys(stdin, '/', 'wrap', '\r', 'r', '\u0015', 'Buy more bubble wrap', '\r');
		expect(body(lastFrame()!)).toContain('○ Buy more bubble wrap');
		unmount();
	});

	it('filters to the current Thread and the Threads below it', async () => {
		current = house;
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, 'f');
		expect(lastFrame()).toContain('Only Move house');
		expect(body(lastFrame()!).slice(1)).toEqual(['-- Move house --', '○ Ask about the deposit', '-- Pack the kitchen --', '○ Buy bubble wrap']);
		unmount();
	});
});
