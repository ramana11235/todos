import {mkdtempSync, writeFileSync} from 'node:fs';
import {createServer, type IncomingHttpHeaders, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {ApiError, Client} from '../src/client/client.js';
import {apiHeaders, apiUrl, settings} from '../src/config.js';

describe('a laptop that uses the hosted Instance', () => {
	const saved = {home: process.env.TODOS_HOME, url: process.env.TODOS_API_URL, port: process.env.TODOS_PORT};
	const token = {url: 'https://todos.example.dev', clientId: 'id.access', clientSecret: 'cfast_secret'};

	beforeEach(() => {
		process.env.TODOS_HOME = mkdtempSync(join(tmpdir(), 'todos-'));
		delete process.env.TODOS_API_URL;
		delete process.env.TODOS_PORT;
	});

	afterEach(() => {
		for (const [key, value] of [['TODOS_HOME', saved.home], ['TODOS_API_URL', saved.url], ['TODOS_PORT', saved.port]] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	const write = (value: unknown) => writeFileSync(join(process.env.TODOS_HOME!, 'settings.json'), JSON.stringify(value));
	const writeHosted = () => write({instance: 'hosted', ...token});

	it('is local without settings.json', () => {
		expect(settings()).toEqual({instance: 'local'});
		expect(apiUrl()).toBe('http://127.0.0.1:7316');
		expect(apiHeaders()).toEqual({});
	});

	it('is local when settings.json says so', () => {
		write({instance: 'local'});
		expect(apiUrl()).toBe('http://127.0.0.1:7316');
	});

	it.each([
		['an Instance it does not know', {instance: 'cloud', ...token}],
		['no Instance', token],
		['hosted without a token', {instance: 'hosted', url: token.url}],
	])('refuses settings.json with %s', (_, value) => {
		write(value);
		expect(() => settings()).toThrow(/must say "instance": "local", or "instance": "hosted"/);
	});

	it('uses the address and token when settings.json says hosted', () => {
		writeHosted();
		expect(apiUrl()).toBe(token.url);
		expect(apiHeaders()).toEqual({'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 'cfast_secret'});
	});

	it('never sends the token to another address', () => {
		writeHosted();
		process.env.TODOS_API_URL = 'http://127.0.0.1:9999';
		expect(apiHeaders()).toEqual({});
	});
});

describe('the Client', () => {
	let server: Server;
	let seen: IncomingHttpHeaders;
	let answer: (response: import('node:http').ServerResponse) => void;

	beforeEach(async () => {
		server = createServer((request, response) => {
			seen = request.headers;
			answer(response);
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	});

	afterEach(async () => {
		server.closeAllConnections();
		await new Promise(resolve => server.close(resolve));
	});

	const url = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	it('sends its headers with every request', async () => {
		answer = response => response.writeHead(200, {'content-type': 'application/json'}).end('[]');
		await new Client(url(), {'CF-Access-Client-Id': 'id.access'}).threads();
		expect(seen['cf-access-client-id']).toBe('id.access');
	});

	it('gives up on a todos that does not answer', async () => {
		answer = () => {};
		await expect(new Client(url(), {}, 50).threads()).rejects.toThrow(/timeout|aborted/i);
	});

	it('reports a page that is not the API, such as Access turning it away, by its status', async () => {
		answer = response => response.writeHead(403, {'content-type': 'text/html'}).end('<html>Forbidden</html>');
		const error = await new Client(url()).threads().catch(error => error);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.message).toBe(`403 Forbidden from ${url()}/api/threads`);
	});

	it('treats a redirect to the Access sign-in as an error, without following it', async () => {
		answer = response => response.writeHead(302, {location: 'https://example.cloudflareaccess.com/login'}).end();
		await expect(new Client(url()).threads()).rejects.toThrow(`302 Found from ${url()}/api/threads`);
	});
});
