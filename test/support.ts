import {mkdtempSync} from 'node:fs';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApi} from '../src/api/server.js';
import {Client} from '../src/client/client.js';
import {Tasks} from '../src/core/tasks.js';
import {Projects} from '../src/core/projects.js';
import {Thoughts} from '../src/core/thoughts.js';
import {Threads} from '../src/core/threads.js';
import {afterAll} from 'vitest';
import {getPlatformProxy, type PlatformProxy} from 'wrangler';
import {D1Storage, type D1Database} from '../src/storage/d1.js';
import {migrations, SqliteStorage} from '../src/storage/sqlite.js';
import type {Storage} from '../src/storage/storage.js';

// One local D1 per test file, from wrangler.example.jsonc, emptied for each storage
// made from it. It is never the hosted one.
let proxy: PlatformProxy<{DB: D1Database & {batch(statements: unknown[]): Promise<unknown>}}> | undefined;
afterAll(() => proxy?.dispose());

// Empty storage for a test. The d1 test project sets TODOS_TEST_STORAGE so the
// same tests run on D1 as well as on SQLite. `path` is for the SQLite file.
export async function makeStorage(path = ':memory:'): Promise<Storage> {
	if (process.env.TODOS_TEST_STORAGE !== 'd1') return new SqliteStorage(path);
	proxy ??= await getPlatformProxy({configPath: 'wrangler.example.jsonc', persist: false, remoteBindings: false});
	const d1 = proxy.env.DB;
	const tables = ['areas', 'changes', 'projects', 'prompts', 'tasks', 'threads', 'thoughts'];
	// shortcut: splits migrations on semicolons at line ends, which holds while
	// no migration has one inside a string.
	const statements = [...tables.map(table => `DROP TABLE IF EXISTS ${table}`), ...migrations().flatMap(sql => sql.split(/;\s*$/m))]
		.map(sql => sql.replace(/^\s*--.*$/gm, '').trim())
		.filter(Boolean);
	await d1.batch(statements.map(sql => d1.prepare(sql)));
	return new D1Storage(d1);
}

// A real API on a temporary SQLite file, for tests that go through the Client.
export async function startApi(): Promise<{client: Client; url: string; stop: () => Promise<void>}> {
	const storage = await makeStorage(join(mkdtempSync(join(tmpdir(), 'todos-')), 'todos.db'));
	const server: Server = createApi(new Threads(storage), new Tasks(storage), new Thoughts(storage), new Projects(storage));
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	return {
		client: new Client(url),
		url,
		stop: async () => {
			await new Promise(resolve => server.close(resolve));
			storage.close();
		},
	};
}

// The storage as it reads now, for a change that read before another change
// was written: its reads keep returning what is there now, and its writes go
// through. Two edits that overlap are then one made through this and one made
// directly, in a fixed order.
export async function readNow(storage: Storage): Promise<Storage> {
	const [tasks, projects, areas] = await Promise.all([storage.listTasks(), storage.listProjects(), storage.listAreas()]);
	return Object.assign(Object.create(storage) as Storage, {
		listTasks: async () => tasks,
		getTask: async (id: string) => tasks.find(task => task.id === id),
		listProjects: async () => projects,
		listAreas: async () => areas,
	});
}
