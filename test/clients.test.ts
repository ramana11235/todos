// Fails when a client falls out of step with the API: a route with no Client
// method, a Client method calling a route that is gone, or a field the API
// accepts that no MCP tool offers and that is not left out on purpose. Vitest
// also type checks this file, so a field added to the API's types fails here
// until it is listed below.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {Client as McpClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createHandler, type BatchRequest} from '../src/api/api.js';
import {Client} from '../src/client/client.js';
import {Tasks, type NewTask, type TaskEdit} from '../src/core/tasks.js';
import {Projects} from '../src/core/projects.js';
import {Thoughts} from '../src/core/thoughts.js';
import {Threads, type MyEdit, type SessionUpdate} from '../src/core/threads.js';
import type {AreaEdit, NewProject, ProjectEdit} from '../src/core/projects.js';
import {createMcpServer} from '../src/mcp/server.js';
import {makeStorage} from './support.js';

// Routes no Client method calls, each with the reason.
const routesLeftOut: Record<string, string> = {
	'POST /api/threads/:id/turn-started': 'Kept only for hooks from older builds, and removed by issue 55',
};

// Client methods that are not one route.
const methodsLeftOut: Record<string, string> = {
	send: 'Sends any one change written as a batch writes it',
	call: 'The private method every other one sends through',
};

// For each field the API accepts, the MCP tool input that offers it, or why
// no tool does. A Session can do anything I can do apart from writing my
// Thoughts (CONTEXT.md), so leaving a field out needs a reason.
type Offered = {input: string} | {leftOut: string};

const taskFields = {
	title: {input: 'title'},
	when: {input: 'when'},
	threadId: {input: 'thread'},
	belongs: {input: 'belongs_to'},
	notes: {input: 'notes'},
	deadline: {input: 'deadline'},
	checklist: {input: 'checklist'},
	index: {input: 'position'},
	after: {leftOut: 'A Session places a new Task with position, as move_thread places a Thread'},
} satisfies Record<keyof NewTask, Offered>;

const taskEditFields = {
	title: {input: 'title'},
	ended: {input: 'ended'},
	when: {input: 'when'},
	threadId: {input: 'thread'},
	belongs: {input: 'belongs_to'},
	deadline: {input: 'deadline'},
	notes: {input: 'notes'},
	checklist: {input: 'checklist'},
	position: {leftOut: 'The number the web app sets when I drag a Task; a Session places one with position, sent as index'},
	index: {input: 'position'},
} satisfies Record<keyof TaskEdit, Offered>;

const threadEditFields = {
	title: {input: 'title'},
	summary: {input: 'summary'},
	nextStep: {input: 'next_step'},
	notes: {input: 'notes'},
	noteEdits: {input: 'note_edits'},
	whoseMove: {input: 'whose_move'},
	when: {input: 'when'},
	ended: {input: 'ended'},
	deadline: {input: 'deadline'},
	belongs: {input: 'belongs_to'},
	directory: {input: 'directory'},
} satisfies Record<keyof MyEdit, Offered> & Record<keyof SessionUpdate, Offered>;

const newThreadFields = {
	title: {input: 'title'},
	parentId: {input: 'parent'},
	afterId: {leftOut: 'A Session places a new Thread with position, as move_thread does'},
	index: {input: 'position'},
	notes: {input: 'notes'},
	summary: {input: 'summary'},
	nextStep: {input: 'next_step'},
	when: {leftOut: 'Only a Task turned into a Thread passes it; a Session sets it with update_thread'},
	deadline: {leftOut: 'Only a Task turned into a Thread passes it; a Session sets it with update_thread'},
	belongs: {input: 'belongs_to'},
} satisfies Record<keyof Parameters<Threads['create']>[0], Offered>;

const newAreaFields = {
	title: {input: 'title'},
	notes: {input: 'notes'},
} satisfies Record<keyof Parameters<Projects['createArea']>[0], Offered>;

const areaEditFields = {
	title: {input: 'title'},
	notes: {input: 'notes'},
	ended: {input: 'ended'},
	position: {leftOut: 'The number the web app sets when I drag an area in the sidebar; a Session places one with position, sent as index'},
	index: {input: 'position'},
} satisfies Record<keyof AreaEdit, Offered>;

const newProjectFields = {
	title: {input: 'title'},
	notes: {input: 'notes'},
	area: {input: 'area'},
	deadline: {input: 'deadline'},
} satisfies Record<keyof NewProject, Offered>;

const projectEditFields = {
	...newProjectFields,
	ended: {input: 'ended'},
	position: {leftOut: 'The number the web app sets when I drag a project in the sidebar; a Session places one with position, sent as index'},
	index: {input: 'position'},
} satisfies Record<keyof ProjectEdit, Offered>;

// Each change, the tool that makes it with the inputs it needs, and its fields.
// A Thread's Deadline takes a different shape from a Task's.
const threadSamples = {when: {kind: 'someday'}, deadline: {kind: 'none'}};
const taskSamples = {when: {kind: 'today'}, deadline: {kind: 'none'}};
const projectSamples = {deadline: {kind: 'none'}, ended: 'dropped'};

const changes: Array<{change: string; tool: string; args: Record<string, unknown>; fields: Record<string, Offered>; values?: Record<string, unknown>}> = [
	{change: 'adding a Task', tool: 'add_task', args: {title: 'A'}, fields: taskFields, values: taskSamples},
	{change: 'editing a Task', tool: 'edit_task', args: {task: 'a'}, fields: taskEditFields, values: taskSamples},
	{change: 'editing another Thread', tool: 'update_thread', args: {thread: 'other'}, fields: threadEditFields, values: threadSamples},
	{change: "a Session's update to its own Thread", tool: 'update_thread', args: {}, fields: threadEditFields, values: threadSamples},
	{change: 'creating a Thread', tool: 'create_thread', args: {title: 'A'}, fields: newThreadFields},
	{change: 'turning a Task into a Thread', tool: 'turn_task_into_thread', args: {task: 'a'}, fields: {parentId: {input: 'parent'}}},
	{change: 'creating an area', tool: 'create_area', args: {title: 'A'}, fields: newAreaFields},
	{change: 'editing an area', tool: 'update_area', args: {area: 'a'}, fields: areaEditFields, values: {ended: 'dropped'}},
	{change: 'creating a project', tool: 'create_project', args: {title: 'A'}, fields: newProjectFields, values: projectSamples},
	{change: 'editing a project', tool: 'update_project', args: {project: 'a'}, fields: projectEditFields, values: projectSamples},
];

// A value each input accepts.
const samples: Record<string, unknown> = {
	whose_move: 'waiting', ended: 'done', checklist: [], note_edits: [], position: 0, belongs_to: {kind: 'none'},
};

afterEach(() => vi.unstubAllGlobals());

describe('the clients and the API', () => {
	it('have a Client method for every route, and no Client method calling a route that is gone', async () => {
		const storage = await makeStorage();
		const {routes} = createHandler(new Threads(storage), new Tasks(storage), new Thoughts(storage), new Projects(storage));
		const called: string[] = [];
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			called.push(`${init.method} ${new URL(url).pathname}`);
			return new Response('{}', {headers: {'content-type': 'application/json'}});
		});
		const client = new Client('http://api');
		const names = [...Object.keys(client), ...Object.getOwnPropertyNames(Client.prototype)].filter(name => name !== 'constructor');
		for (const name of names) {
			const method = (client as any)[name];
			if (typeof method === 'function' && !(name in methodsLeftOut)) await method.call(client, 'a', 'a', 'a', {});
		}
		const routeOf = (call: string) =>
			routes.find(route => new RegExp(`^${route.replace(/:[a-z]+/g, '[^/]+')}$`).test(call));
		expect(called.filter(call => !routeOf(call))).toEqual([]);
		expect(routes.filter(route => !called.some(call => routeOf(call) === route))).toEqual(Object.keys(routesLeftOut));
	});

	it.each(changes)('offer every field of $change through $tool', async ({tool, args, fields, values}) => {
		const sent: BatchRequest[] = [];
		const client = {send: async (request: BatchRequest) => (sent.push(request), {id: 'a'})} as unknown as Client;
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		await createMcpServer({client, threadId: 'mine'}).connect(serverSide);
		const mcp = new McpClient({name: 'test', version: '0'});
		await mcp.connect(clientSide);
		for (const [field, offered] of Object.entries(fields)) {
			if (!('input' in offered)) continue;
			sent.length = 0;
			const result: any = await mcp.callTool({name: tool, arguments: {...args, [offered.input]: {...samples, ...values}[offered.input] ?? 'a'}});
			expect(result.isError, `${tool} refused ${offered.input}: ${result.content[0].text}`).toBeFalsy();
			expect((sent[0]?.body as any)?.[field], `${tool}'s ${offered.input} should reach the API as ${field}`).toBeDefined();
		}
		await mcp.close();
	});
});
