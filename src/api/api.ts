// The one API every client talks to. It only translates HTTP into calls on
// Threads, Tasks, projects, areas and Thoughts, so all the rules stay in the core. It works on
// the web's own Request and Response, so the same routes run in Node on a
// laptop and in a Cloudflare Worker.

import type {Area, Project} from '../core/project.js';
import type {Projects} from '../core/projects.js';
import type {Task} from '../core/task.js';
import type {Tasks} from '../core/tasks.js';
import type {Thoughts} from '../core/thoughts.js';
import {ThreadError, type Threads} from '../core/threads.js';
import type {SessionSignal, Thread} from '../core/thread.js';

type Handler = (params: Record<string, string>, body: any) => Promise<unknown>;

// One request inside a batch, written as it would be sent on its own.
export type BatchRequest = {method: string; path: string; body?: unknown};
export type BatchResult = {status: number; body: unknown};

// The hosted Instance on Cloudflare's free plan may run only 50 D1 queries in
// one request, and ten typical changes take 20 to 30 (docs/adr/0004).
export const batchLimit = 10;
// Turning a Task into a Thread takes about 9 queries however long its
// checklist, so only 4 fit in a batch alongside other changes.
export const turnsIntoThreadsLimit = 4;

// The changes a Session makes with its tools. Reads, prompts and the signals
// hooks send are left out of batches.
const batchable = new Set([
	'POST /api/threads',
	'PATCH /api/threads/:id',
	'POST /api/threads/:id/move',
	'POST /api/threads/:id/session-update',
	'POST /api/tasks',
	'PATCH /api/tasks/:id',
	'POST /api/tasks/:id/thread',
	'POST /api/areas',
	'PATCH /api/areas/:id',
	'POST /api/projects',
	'PATCH /api/projects/:id',
]);

// The answer to a poll: nothing changed since the number the client last
// saw, or the open Threads and Tasks, with every project and area, as they
// are now with the number to send next time.
export type Changes = {kind: 'same'} | {kind: 'changed'; number: number; threads: Thread[]; tasks: Task[]; projects: Project[]; areas: Area[]};

export type ApiHandler = (request: Request) => Promise<Response>;

// `build` says which build of todos is serving, so the launcher can tell when
// a running API is out of date, `home` which Instance it serves, and `pid`
// which process to stop to replace it.
export function createHandler(
	threads: Threads,
	tasks: Tasks,
	thoughts: Thoughts,
	projects: Projects,
	{build = null, home = null, pid = null}: {build?: string | null; home?: string | null; pid?: number | null} = {},
): ApiHandler & {routes: string[]} {
	const routes: Array<[method: string, pattern: string, handler: Handler]> = [
		['GET', '/api/health', async () => ({ok: true, build, home, pid})],
		['GET', '/api/threads', async () => threads.list()],
		['POST', '/api/threads', async (_, body) =>
			threads.create({title: body.title, parentId: body.parentId ?? null, afterId: body.afterId ?? null, index: body.index, notes: body.notes, summary: body.summary, nextStep: body.nextStep, when: body.when, deadline: body.deadline, belongs: body.belongs}),
		],
		['GET', '/api/threads/:id', async ({id}) => threads.get(id!)],
		['PATCH', '/api/threads/:id', async ({id}, body) => threads.edit(id!, body)],
		['POST', '/api/threads/:id/move', async ({id}, body) => threads.move(id!, body.parentId ?? null, body.index)],
		['POST', '/api/threads/:id/reorder', async ({id}, body) => {
			await threads.reorder(id!, body.direction === 'up' ? 'up' : 'down');
			return {ok: true};
		}],
		['POST', '/api/threads/:id/session', async ({id}, body) => threads.recordSession(id!, body)],
		// Hooks from an older build still call this when a prompt arrives, and
		// read `remind` to decide whether to remind the Session to update its
		// Thread. Sessions are no longer reminded, so it only marks it busy.
		['POST', '/api/threads/:id/turn-started', async ({id}) => {
			await threads.signal(id!, 'busy');
			return {remind: false};
		}],
		['POST', '/api/threads/:id/signal', async ({id}, body) => {
			await threads.signal(id!, parseSignal(body.signal));
			return {ok: true};
		}],
		['GET', '/api/threads/:id/session-view', async ({id}) => threads.sessionView(id!)],
		['POST', '/api/threads/:id/session-update', async ({id}, body) => threads.sessionUpdate(id!, body)],
		['GET', '/api/prompts', async () => threads.prompts()],
		['POST', '/api/threads/:id/prompts', async ({id}, body) => threads.sendPrompt(id!, body.text ?? null)],
		['DELETE', '/api/prompts/:id', async ({id}) => threads.promptDelivered(id!).then(() => ({}))],
		// `since` is the number the client last saw, or anything else, such as
		// "none", for a client that has seen nothing yet. The number is read
		// first, so a change made while the lists are read is fetched again
		// next time rather than missed.
		['GET', '/api/changes/:since', async ({since}): Promise<Changes> => {
			const number = await threads.changeNumber();
			if (since === String(number)) return {kind: 'same'};
			const [threadList, taskList, projectList, areaList] = await Promise.all([threads.list(), tasks.list(), projects.listProjects(), projects.listAreas()]);
			return {kind: 'changed', number, threads: threadList, tasks: taskList, projects: projectList, areas: areaList};
		}],
		['GET', '/api/tasks', async () => tasks.list()],
		['GET', '/api/tasks/:id', async ({id}) => tasks.get(id!)],
		['GET', '/api/logbook', async () => tasks.logbook()],
		['POST', '/api/tasks', async (_, body) => tasks.add(body)],
		['PATCH', '/api/tasks/:id', async ({id}, body) => tasks.edit(id!, body)],
		// With no parent given, the Thread goes under the Thread the Task is linked to.
		['POST', '/api/tasks/:id/thread', async ({id}, body) =>
			tasks.turnIntoThread(id!, body.parentId === undefined ? (await tasks.get(id!)).threadId : body.parentId, threads)],
		['POST', '/api/tasks/:id/reorder', async ({id}, body) => {
			await tasks.reorder(id!, body.direction === 'up' ? 'up' : 'down');
			return {ok: true};
		}],
		['GET', '/api/areas', async () => projects.listAreas()],
		['POST', '/api/areas', async (_, body) => projects.createArea(body)],
		['PATCH', '/api/areas/:id', async ({id}, body) => projects.editArea(id!, body)],
		['GET', '/api/projects', async () => projects.listProjects()],
		['POST', '/api/projects', async (_, body) => projects.createProject(body)],
		['PATCH', '/api/projects/:id', async ({id}, body) => projects.editProject(id!, body)],
		['GET', '/api/thoughts', async () => thoughts.get()],
		['PUT', '/api/thoughts', async (_, body) => thoughts.save(body.text, body.version)],
		// Runs each change in order and stops at the first that fails, keeping
		// the ones before it (docs/adr/0004). The batch failed when its last
		// result's status is not 200 or it says `updated: false`, and the
		// requests after it were not tried.
		['POST', '/api/batch', async (_, body) => {
			const requests: unknown = body.requests;
			if (!Array.isArray(requests)) throw new ThreadError('invalid', 'A batch needs a list of requests');
			if (requests.length > batchLimit) throw new ThreadError('invalid', `A batch holds at most ${batchLimit} changes`);
			const found = requests.map(request => {
				const route = typeof request?.method === 'string' && typeof request?.path === 'string' ? find(request.method, request.path) : undefined;
				return route && batchable.has(`${route.method} ${route.pattern}`) ? route : undefined;
			});
			const refused = found.indexOf(undefined);
			if (refused !== -1) throw new ThreadError('invalid', `Change ${refused} is not one a batch can make`);
			if (found.filter(route => route!.pattern === '/api/tasks/:id/thread').length > turnsIntoThreadsLimit) {
				throw new ThreadError('invalid', `A batch turns at most ${turnsIntoThreadsLimit} Tasks into Threads, so nothing was changed`);
			}
			const results: BatchResult[] = [];
			for (const [index, route] of found.entries()) {
				const result = await respond(() => route!.handler(route!.params, requests[index].body ?? {}));
				results.push(result);
				// A Session's update that I edited the Thread before answers
				// `updated: false` rather than an error, but nothing was saved.
				if (result.status !== 200 || (result.body as {updated?: boolean}).updated === false) break;
			}
			return {results};
		}],
	];

	const find = (method: string, path: string) => {
		for (const [routeMethod, pattern, handler] of routes) {
			if (method !== routeMethod) continue;
			const params = match(pattern, path);
			if (params) return {method, pattern, handler, params};
		}
		return undefined;
	};

	const handle: ApiHandler = async request => {
		const path = new URL(request.url).pathname;
		// A page on another website can send a form or plain text here with
		// my sign-in cookie, but cannot say it is sending JSON unless the API
		// allows it, which it never does. So a change is taken only as JSON.
		if (request.method !== 'GET' && !request.headers.get('content-type')?.startsWith('application/json')) {
			return json(415, {error: 'Changes must be sent as application/json'});
		}
		const route = find(request.method, path);
		if (!route) return json(404, {error: `Nothing at ${request.method} ${path}`});
		const {status, body} = await respond(async () => route.handler(route.params, request.method === 'GET' ? {} : await readJson(request)));
		return json(status, body);
	};
	// Every route as "METHOD /pattern", so a test can check each has a client.
	return Object.assign(handle, {routes: routes.map(([method, pattern]) => `${method} ${pattern}`)});
}

async function respond(run: () => Promise<unknown>): Promise<BatchResult> {
	try {
		return {status: 200, body: await run()};
	} catch (error) {
		if (error instanceof ThreadError) return {status: error.code === 'not_found' ? 404 : 400, body: {error: error.message}};
		if (error instanceof SyntaxError) return {status: 400, body: {error: 'The request body is not valid JSON'}};
		return {status: 500, body: {error: String(error)}};
	}
}

function match(pattern: string, path: string): Record<string, string> | null {
	const want = pattern.split('/');
	const got = path.split('/');
	if (want.length !== got.length) return null;
	const params: Record<string, string> = {};
	for (let i = 0; i < want.length; i++) {
		if (want[i]!.startsWith(':')) params[want[i]!.slice(1)] = decodeURIComponent(got[i]!);
		else if (want[i] !== got[i]) return null;
	}
	return params;
}

async function readJson(request: Request): Promise<any> {
	const text = await request.text();
	return text ? JSON.parse(text) : {};
}

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}

function parseSignal(value: unknown): SessionSignal | null {
	if (value === 'busy' || value === 'asking' || value === 'finished') return value;
	return null;
}
