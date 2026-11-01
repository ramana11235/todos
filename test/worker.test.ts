import {describe, expect, it} from 'vitest';
import worker from '../src/worker.js';
import type {D1Database} from '../src/storage/d1.js';

// A database that fails the test if the Worker ever reaches it.
const untouched = {
	prepare: () => {
		throw new Error('The Worker read the database without a valid Access token');
	},
} as unknown as D1Database;

const env = {DB: untouched, ACCESS_TEAM: 'https://example.cloudflareaccess.com', ACCESS_AUD: 'todos-aud'};

describe('the Worker', () => {
	it('turns away an API request without an Access token before reaching the data', async () => {
		const response = await worker.fetch(new Request('https://todos.example.dev/api/threads'), env);
		expect(response.status).toBe(403);
	});

	it('turns away an API request with a token Access did not sign', async () => {
		const request = new Request('https://todos.example.dev/api/threads', {headers: {'Cf-Access-Jwt-Assertion': 'not.a.token'}});
		expect((await worker.fetch(request, env)).status).toBe(403);
	});
});
