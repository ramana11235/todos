import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {Client} from '../src/client/client.js';
import {startApi} from './support.js';

let client: Client;
let stop: () => Promise<void>;

beforeEach(async () => ({client, stop} = await startApi()));
afterEach(() => stop());

describe('Settings', () => {
	it('start with the blue accent colour', async () => {
		expect(await client.settings()).toEqual({accentColour: 'blue'});
	});

	it('keep a picked colour and send it with the next changes', async () => {
		const before = await client.changes({kind: 'nothing'});
		if (before.kind !== 'changed') throw new Error('A first poll always has changes');
		expect(before.settings).toEqual({accentColour: 'blue'});
		expect(await client.editSettings({accentColour: 'red'})).toEqual({accentColour: 'red'});
		expect(await client.changes({kind: 'number', number: before.number})).toMatchObject({kind: 'changed', settings: {accentColour: 'red'}});
	});

	it('refuse a colour that is not one of the choices', async () => {
		await expect(client.editSettings({accentColour: 'orange' as never})).rejects.toThrow('must be one of');
		expect(await client.settings()).toEqual({accentColour: 'blue'});
	});
});
