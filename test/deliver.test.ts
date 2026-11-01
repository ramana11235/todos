import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {Client} from '../src/client/client.js';
import type {Thread} from '../src/core/thread.js';
import {deliverPrompts} from '../src/session/deliver.js';
import {startApi} from './support.js';

let client: Client;
let stop: () => Promise<void>;
let live: Set<string>;
let typed: Array<[string, string]>;
let started: Array<[string, string, string | undefined]>;
let ci: Thread;

const deliver = () =>
	deliverPrompts(client, {
		livePanes: () => live,
		start: (thread, directory, prompt) => {
			if (directory === '/missing') throw new Error('There is no folder at /missing');
			started.push([thread.title, directory, prompt]);
			live.add('%9');
			return {sessionPane: '%9', claudeSessionId: 'new-session'};
		},
		type: (pane, text) => void typed.push([pane, text]),
	});

beforeEach(async () => {
	({client, stop} = await startApi());
	live = new Set();
	typed = [];
	started = [];
	const launch = await client.create('Launch v1');
	await client.edit(launch.id, {directory: '/work/launch'});
	ci = await client.create('Set up CI', launch.id);
});

afterEach(() => stop());

describe('delivering prompts', () => {
	it('types a prompt into a running Session that is free or busy, in the order sent', async () => {
		await client.recordSession(ci.id, {sessionPane: '%1'});
		await client.signal(ci.id, 'busy');
		live.add('%1');
		await client.sendPrompt(ci.id, 'Rerun CI');
		await client.sendPrompt(ci.id, 'Then tell me');
		await deliver();
		await deliver();
		expect(typed).toEqual([['%1', 'Rerun CI'], ['%1', 'Then tell me']]);
		expect(await client.prompts()).toEqual([]);
	});

	it('waits while the Session is asking me something, and delivers once I answer', async () => {
		await client.recordSession(ci.id, {sessionPane: '%1'});
		await client.signal(ci.id, 'asking');
		live.add('%1');
		await client.sendPrompt(ci.id, 'Rerun CI');
		await deliver();
		expect(typed).toEqual([]);
		await client.signal(ci.id, 'busy');
		await deliver();
		expect(typed).toEqual([['%1', 'Rerun CI']]);
	});

	it('starts a Session in the background with the prompt first, then waits for it to be ready', async () => {
		await client.recordSession(ci.id, {sessionPane: '%1'});
		await client.signal(ci.id, 'finished');
		await client.sendPrompt(ci.id, 'Rerun CI');
		await client.sendPrompt(ci.id, 'Then tell me');
		await deliver();
		expect(started).toEqual([['Set up CI', '/work/launch', 'Rerun CI']]);
		expect(await client.thread(ci.id)).toMatchObject({sessionPane: '%9', claudeSessionId: 'new-session', sessionSignal: null});
		await deliver();
		expect(typed).toEqual([]);
		// The Session-start hook says it is ready.
		await client.signal(ci.id, 'finished');
		await deliver();
		expect(typed).toEqual([['%9', 'Then tell me']]);
	});

	it('starts a Session with no prompt of its own when only asked to start', async () => {
		await client.sendPrompt(ci.id, null);
		await deliver();
		expect(started).toEqual([['Set up CI', '/work/launch', undefined]]);
		expect(await client.prompts()).toEqual([]);
	});

	it('keeps a prompt for a Thread with no Directory until it has one', async () => {
		const house = await client.create('Move house');
		await client.sendPrompt(house.id, 'Book the van');
		await deliver();
		expect(started).toEqual([]);
		await client.edit(house.id, {directory: '/home'});
		await deliver();
		expect(started).toEqual([['Move house', '/home', 'Book the van']]);
	});

	it('keeps a prompt for a Thread whose Directory does not exist until it does', async () => {
		const site = await client.create('Set up the site');
		await client.edit(site.id, {directory: '/missing'});
		await client.sendPrompt(site.id, 'Deploy it');
		await deliver();
		expect(started).toEqual([]);
		await client.edit(site.id, {directory: '/work/site'});
		await deliver();
		expect(started).toEqual([['Set up the site', '/work/site', 'Deploy it']]);
	});
});
