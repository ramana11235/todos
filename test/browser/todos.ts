// What every browser test is given: a page, and a todos Instance of its own,
// on a new SQLite file in a fresh temporary folder and on a port the system
// picks. The page only ever opens that Instance's address.

import {mkdtempSync, rmSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {test as base, type Page} from '@playwright/test';
import {createApi} from '../../src/api/server.js';
import {Client} from '../../src/client/client.js';
import {Projects} from '../../src/core/projects.js';
import {InstanceSettings} from '../../src/core/settings.js';
import {Tasks} from '../../src/core/tasks.js';
import {Thoughts} from '../../src/core/thoughts.js';
import {Threads} from '../../src/core/threads.js';
import {SqliteStorage} from '../../src/storage/sqlite.js';

export type Todos = {client: Client; url: string};

export const test = base.extend<{todos: Todos}>({
	todos: async ({}, use) => {
		const folder = mkdtempSync(join(tmpdir(), 'todos-browser-'));
		const storage = new SqliteStorage(join(folder, 'todos.db'));
		const server = createApi(new Threads(storage), new Tasks(storage), new Thoughts(storage), new Projects(storage), new InstanceSettings(storage), {
			web: resolve(import.meta.dirname, '../../dist/web'),
		});
		await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		await use({client: new Client(url), url});
		server.closeAllConnections();
		await new Promise(done => server.close(done));
		storage.close();
		rmSync(folder, {recursive: true, force: true});
	},
});

export {expect} from '@playwright/test';

// Waits for the one thing the page states: that no call to the API is
// running and it has drawn what the calls brought back.
export async function settled(page: Page): Promise<void> {
	await page.locator('html[data-settled="true"]').waitFor({state: 'attached'});
}

// Opens a place in the web app, such as 'today', and waits for it to settle.
export async function open(page: Page, todos: Todos, hash: string): Promise<void> {
	await page.goto(`${todos.url}/#${hash}`);
	await settled(page);
}
