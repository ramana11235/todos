import {Client as McpClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {Client} from '../src/client/client.js';
import {createMcpServer} from '../src/mcp/server.js';
import {startApi} from './support.js';

let client: Client;
let stop: () => Promise<void>;
let mcp: McpClient;
let mine: string;
let sibling: string;

const call = async (name: string, args: Record<string, unknown> = {}) => {
	const result: any = await mcp.callTool({name, arguments: args});
	const body = result.content[0].text;
	// A refused call comes back as plain text rather than JSON.
	return {isError: Boolean(result.isError), body: result.isError && !body.startsWith('{') ? body : JSON.parse(body)};
};

beforeEach(async () => {
	({client, stop} = await startApi());
	const launch = await client.create('Launch v1');
	mine = (await client.create('Build the MCP server', launch.id)).id;
	sibling = (await client.create('Build the TUI', launch.id)).id;
	await client.create('Move house');

	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await createMcpServer({client, threadId: mine}).connect(serverSide);
	mcp = new McpClient({name: 'test', version: '0'});
	await mcp.connect(clientSide);
});

afterEach(async () => {
	await mcp.close();
	await stop();
});

describe('the MCP server', () => {
	it('tells the Session about its Thread in its instructions', () => {
		expect(mcp.getInstructions()).toContain('update_thread');
	});

	it('offers one set of tools for its own Thread and any other, and only reads my Thoughts', async () => {
		const {tools} = await mcp.listTools();
		expect(tools.map(tool => tool.name).sort()).toEqual([
			'add_task', 'batch', 'create_area', 'create_project', 'create_thread', 'edit_task', 'find_projects', 'find_tasks', 'find_threads', 'get_task', 'get_thoughts',
			'get_thread', 'move_thread', 'send_prompt', 'start_session', 'turn_task_into_thread', 'update_area', 'update_project', 'update_thread',
		]);
	});

	it('says to act beyond its own Thread only when told, to ask when a name is unclear, and never to start a Session unasked', () => {
		const instructions = mcp.getInstructions()!;
		expect(instructions).toContain('Outside your own Thread, act only when the user tells you to');
		expect(instructions).toContain('If several fit, or none, ask');
		expect(instructions).toContain('Creating a Thread never starts its Session');
		expect(instructions).toContain('create the Thread and ask whether to start it');
	});

	it('reads my Thoughts, and says to only when I ask', async () => {
		await client.saveThoughts('# web app\nWaiting first?', 0);
		const result: any = await mcp.callTool({name: 'get_thoughts', arguments: {}});
		expect(result.content[0].text).toBe('# web app\nWaiting first?');
		expect(mcp.getInstructions()).toContain('get_thoughts only when the user asks');
	});

	it('adds Tasks to its own Thread, in the Inbox unless told another list', async () => {
		expect((await call('add_task', {title: 'Review the PR'})).body).toMatchObject({added: true});
		await call('add_task', {title: 'Reply to CI', when: {kind: 'today'}});
		expect((await client.tasks()).map(t => [t.title, t.when.kind, t.threadId])).toEqual([
			['Review the PR', 'inbox', mine],
			['Reply to CI', 'today', mine],
		]);
		expect(mcp.getInstructions()).toContain('action verb');
	});

	it('marks its Thread done when told, and says how to pick a Thread up', async () => {
		await call('get_thread');
		expect((await call('update_thread', {summary: 'Shipped.', next_step: 'Nothing', ended: 'done'})).body).toEqual({updated: true});
		expect((await client.thread(mine)).ended).toBe('done');
		expect(mcp.getInstructions()).toContain('"pick up"');
	});

	it('updates its own Thread and nothing else', async () => {
		const {body} = await call('update_thread', {summary: 'Tools work.', next_step: 'Waiting on CI', whose_move: 'waiting'});
		expect(body).toEqual({updated: true});
		expect(await client.thread(mine)).toMatchObject({nextStep: 'Waiting on CI'});
		expect((await client.thread(sibling)).summary).toBe('');
	});

	it('refuses an update after I edited the Thread by hand, showing my version, then takes the next one', async () => {
		await call('get_thread');
		await client.edit(mine, {summary: 'My words.'});
		const refused = await call('update_thread', {summary: 'Its words.', next_step: 'Ship it', whose_move: 'on_me'});
		expect(refused.isError).toBe(true);
		expect(refused.body.theirVersion.summary).toBe('My words.');
		expect((await call('update_thread', {summary: 'My words, kept.', next_step: 'Ship it', whose_move: 'on_me'})).body).toEqual({updated: true});
	});

	it('keeps its Notes, a passage at a time, and is shown them when an edit does not fit', async () => {
		await call('update_thread', {notes: 'Tools: three done.\nCI: red.', summary: '- Tools done'});
		expect((await call('update_thread', {note_edits: [{old: 'red', new: 'green'}]})).body).toEqual({updated: true});
		expect((await call('get_thread')).body.notes).toBe('Tools: three done.\nCI: green.');
		const refused = await call('update_thread', {summary: '- All green', note_edits: [{old: 'CI: red', new: 'x'}]});
		expect(refused.isError).toBe(true);
		expect(refused.body).toMatchObject({error: expect.stringContaining('CI: red'), notes: 'Tools: three done.\nCI: green.'});
		expect((await client.thread(mine)).summary).toBe('- Tools done');
	});

	it('says the Notes are the source and the Summary is drawn from them', () => {
		const instructions = mcp.getInstructions()!;
		expect(instructions).toContain('Another Session only learns what is in the notes');
		expect(instructions).toContain('Never put anything in it that the notes do not say');
		expect(instructions).toContain('Rewrite the notes whole when you reach a point worth picking up from');
		expect(instructions).toContain('carry it into the notes');
	});

	it('shows another Thread\'s Notes when reading it, but not when finding Threads', async () => {
		await client.edit(sibling, {notes: 'Ink inside tmux.'});
		expect((await call('get_thread', {thread: sibling})).body.notes).toBe('Ink inside tmux.');
		expect((await call('find_threads')).body.every((row: any) => !('notes' in row))).toBe(true);
		expect((await call('update_thread', {thread: sibling, note_edits: [{old: 'Ink', new: 'Ink 7'}]})).body).toEqual({updated: true});
		expect((await client.thread(sibling)).notes).toBe('Ink 7 inside tmux.');
	});

	it('shows my Notes along with the rest of my version when refusing an update', async () => {
		await call('get_thread');
		await client.edit(mine, {notes: 'My notes.'});
		expect((await call('update_thread', {notes: 'Its notes.'})).body.theirVersion.notes).toBe('My notes.');
	});

	it('finds Threads anywhere by words in them, or lists them all in tree order, marking its own', async () => {
		const all = (await call('find_threads')).body;
		expect(all.map((row: any) => `${row.depth}:${row.title}${row.yours ? '*' : ''}`)).toEqual([
			'0:Launch v1', '1:Build the MCP server*', '1:Build the TUI', '0:Move house',
		]);
		await client.edit(sibling, {summary: 'Ink inside tmux.'});
		const found = (await call('find_threads', {query: 'TMUX'})).body;
		expect(found.map((row: any) => [row.id, row.title, row.parent])).toEqual([[sibling, 'Build the TUI', 'Launch v1']]);
	});

	it('reads, changes and moves another Thread, changing only what it names, as if I did it', async () => {
		await client.sessionUpdate(sibling, {summary: 'Ink inside tmux.', nextStep: 'Add keys', whoseMove: 'waiting'});
		expect((await call('get_thread', {thread: sibling})).body).toMatchObject({title: 'Build the TUI', summary: 'Ink inside tmux.'});
		expect((await call('update_thread', {thread: sibling, title: 'Build Home'})).body).toEqual({updated: true});
		expect(await client.thread(sibling)).toMatchObject({title: 'Build Home', summary: 'Ink inside tmux.', nextStep: 'Add keys', whoseMove: 'waiting'});
		// That Thread's own Session keeps the change, as it keeps mine.
		expect((await client.sessionUpdate(sibling, {summary: 'x', nextStep: 'y', whoseMove: 'on_me'})).updated).toBe(false);

		const house = (await call('find_threads', {query: 'house'})).body[0].id;
		await call('move_thread', {thread: house, parent: sibling});
		await call('move_thread', {thread: sibling, parent: null, position: 0});
		expect((await call('find_threads')).body.map((row: any) => `${row.depth}:${row.title}`)).toEqual([
			'0:Build Home', '1:Move house', '0:Launch v1', '1:Build the MCP server',
		]);
		expect((await call('move_thread', {thread: sibling, parent: house})).isError).toBe(true);
	});

	it('creates a Thread anywhere with its Notes, Summary and Next step, and no Session', async () => {
		const {body} = await call('create_thread', {
			title: 'Write the docs', parent: null, notes: 'Cover npm and the SQLite file.', summary: 'For installing.', next_step: 'Draft the README',
		});
		expect(await client.thread(body.id)).toMatchObject({
			title: 'Write the docs', parentId: null, notes: 'Cover npm and the SQLite file.', summary: 'For installing.', nextStep: 'Draft the README', claudeSessionId: null,
		});
		const child = (await call('create_thread', {title: 'Add a test'})).body.id;
		expect((await client.thread(child)).parentId).toBe(mine);
	});

	it('makes several changes in one call, in order, returning the ids of what it created', async () => {
		const house = (await call('find_threads', {query: 'house'})).body[0].id;
		const {isError, body} = await call('batch', {changes: [
			{tool: 'create_thread', title: 'Plan the move', parent: null, notes: 'Vans and boxes.', next_step: 'Book a van'},
			{tool: 'update_thread', thread: sibling, whose_move: 'waiting', next_step: 'Waiting on review'},
			{tool: 'move_thread', thread: house, parent: sibling},
			{tool: 'add_task', title: 'Buy boxes', thread: sibling},
			{tool: 'update_thread', summary: 'Batches work.'},
		]});
		expect(isError).toBe(false);
		expect(body.results).toEqual([{done: true, id: expect.any(String)}, {done: true}, {done: true}, {done: true, id: expect.any(String)}, {done: true}]);
		expect(await client.thread(body.results[0].id)).toMatchObject({title: 'Plan the move', parentId: null, notes: 'Vans and boxes.', nextStep: 'Book a van'});
		expect(await client.thread(sibling)).toMatchObject({whoseMove: 'waiting', nextStep: 'Waiting on review'});
		expect((await client.thread(house)).parentId).toBe(sibling);
		expect((await client.tasks()).find(task => task.id === body.results[3].id)).toMatchObject({title: 'Buy boxes', threadId: sibling});
		// Its own Thread is updated as a Session, not as me.
		expect(await client.thread(mine)).toMatchObject({summary: 'Batches work.', myEditAt: null});
	});

	it('turns a Task into a Thread under its own Thread unless told where, also in a batch', async () => {
		const linked = (await call('add_task', {title: 'Write the docs', thread: sibling})).body.id;
		const loose = (await call('add_task', {title: 'Book a van', thread: null})).body.id;
		const placed = (await call('add_task', {title: 'Pack the books'})).body.id;
		const first = (await call('turn_task_into_thread', {task: linked})).body.id;
		expect(await client.thread(first)).toMatchObject({title: 'Write the docs', parentId: sibling});
		const {body} = await call('batch', {changes: [{tool: 'turn_task_into_thread', task: loose}, {tool: 'turn_task_into_thread', task: placed, parent: null}]});
		expect(body.results).toEqual([{done: true, id: expect.any(String)}, {done: true, id: expect.any(String)}]);
		expect((await client.thread(body.results[0].id)).parentId).toBeNull();
		expect((await client.thread(body.results[1].id)).parentId).toBeNull();
		expect(await client.tasks()).toEqual([]);
	});

	it('stops a batch at the first change that fails, keeping the ones before it', async () => {
		const {isError, body} = await call('batch', {changes: [
			{tool: 'update_thread', thread: sibling, title: 'Build Home'},
			{tool: 'move_thread', thread: sibling, parent: sibling},
			{tool: 'update_thread', thread: sibling, summary: 'Never written.'},
		]});
		expect(isError).toBe(true);
		expect(body).toEqual({results: [{done: true}, {error: 'A Thread cannot move under itself'}], notTried: 1});
		expect(await client.thread(sibling)).toMatchObject({title: 'Build Home', summary: '', parentId: (await client.thread(mine)).parentId});
	});

	it('shows the Notes as they are when a note edit in a batch does not fit', async () => {
		await call('update_thread', {notes: 'CI: green.'});
		const {isError, body} = await call('batch', {changes: [{tool: 'update_thread', note_edits: [{old: 'CI: red', new: 'x'}]}]});
		expect(isError).toBe(true);
		expect(body.results[0]).toMatchObject({error: expect.stringContaining('CI: red'), notes: 'CI: green.'});
	});

	it('stops a batch when I edited its own Thread by hand, showing my version', async () => {
		await call('get_thread');
		await client.edit(mine, {summary: 'My words.'});
		const {isError, body} = await call('batch', {changes: [
			{tool: 'update_thread', summary: 'Its words.'},
			{tool: 'update_thread', thread: sibling, title: 'Build Home'},
		]});
		expect(isError).toBe(true);
		expect(body.results[0]).toMatchObject({error: expect.stringContaining('by hand'), theirVersion: {summary: 'My words.'}});
		expect(body.notTried).toBe(1);
		expect((await client.thread(sibling)).title).toBe('Build the TUI');
	});

	it('refuses a batch of more than ten changes, or with one a batch cannot make, before running any of it', async () => {
		const rename = {method: 'PATCH', path: `/api/threads/${sibling}`, body: {title: 'Build Home'}};
		await expect(client.batch(Array(11).fill(rename))).rejects.toMatchObject({status: 400, message: 'A batch holds at most 10 changes'});
		await expect(client.batch([rename, {method: 'POST', path: `/api/threads/${sibling}/prompts`, body: {text: 'Hi'}}]))
			.rejects.toMatchObject({status: 400, message: 'Change 1 is not one a batch can make'});
		expect((await client.thread(sibling)).title).toBe('Build the TUI');
		expect(await client.prompts()).toEqual([]);
	});

	it('creates, finds and ends projects and areas, and puts Threads and Tasks in them', async () => {
		const health = (await call('create_area', {title: 'Health'})).body.id;
		const run = (await call('create_project', {title: 'Run a 10k', area: health})).body.id;
		expect((await call('find_projects', {query: '10k'})).body).toEqual({
			areas: [],
			projects: [{id: run, title: 'Run a 10k', notes: '', area: {kind: 'in', id: health}, deadline: {kind: 'none'}, ended: 'not_ended'}],
		});
		const launch = (await call('find_threads', {query: 'Launch'})).body[0].id;
		await call('update_thread', {thread: launch, belongs_to: {kind: 'project', id: run}});
		expect((await call('find_threads', {query: 'TUI'})).body[0].belongsTo).toEqual({kind: 'project', id: run});
		expect((await call('update_thread', {belongs_to: {kind: 'area', id: health}})).isError).toBe(true);
		await call('add_task', {title: 'Book a class', belongs_to: {kind: 'area', id: health}});
		expect((await call('find_tasks', {query: 'class'})).body[0]).toMatchObject({thread: null, belongsTo: {kind: 'area', id: health}});
		const swim = (await call('create_project', {title: 'Learn to swim', area: health})).body.id;
		const work = (await call('create_area', {title: 'Work'})).body.id;
		await call('batch', {changes: [{tool: 'update_project', project: swim, position: 0}, {tool: 'update_area', area: work, position: 0}]});
		expect((await call('find_projects')).body).toMatchObject({areas: [{title: 'Work'}, {title: 'Health'}], projects: [{title: 'Learn to swim'}, {title: 'Run a 10k'}]});
		await call('update_project', {project: run, ended: 'done', area: null});
		await call('update_area', {area: health, ended: 'dropped'});
		expect((await call('find_projects', {query: 'Health'})).body).toMatchObject({areas: [{ended: 'dropped'}]});
		expect((await call('find_projects', {query: '10k'})).body).toMatchObject({projects: [{ended: 'done', area: {kind: 'none'}}]});
	});

	it('finds, moves and ends Tasks on any Thread or none', async () => {
		expect((await call('add_task', {title: 'Call the landlord', thread: null})).body).toEqual({added: true, id: expect.any(String)});
		await call('add_task', {title: 'Fix the keys', thread: sibling, when: {kind: 'today'}});
		const found = (await call('find_tasks', {query: 'landlord'})).body;
		expect(found).toEqual([{id: expect.any(String), title: 'Call the landlord', list: 'inbox', when: {kind: 'inbox'}, deadline: {kind: 'none'}, ended: 'not_ended', thread: null, belongsTo: {kind: 'none'}}]);
		expect((await call('find_tasks', {thread: sibling})).body.map((t: any) => [t.title, t.list, t.thread.title])).toEqual([['Fix the keys', 'today', 'Build the TUI']]);
		await call('edit_task', {task: found[0].id, thread: sibling, when: {kind: 'on_day', day: '2099-01-01'}});
		expect((await call('find_tasks', {query: 'landlord'})).body[0]).toMatchObject({list: 'upcoming', thread: {id: sibling}});
		await call('edit_task', {task: found[0].id, ended: 'dropped'});
		expect((await call('find_tasks')).body.map((t: any) => t.title)).toEqual(['Fix the keys']);
	});

	it('writes a Task\'s Notes when adding or editing it, alone or in a batch', async () => {
		const added = (await call('add_task', {title: 'Check the panel', notes: '1. Open Home'})).body.id;
		const notesOf = async (id: string) => (await client.tasks()).find(task => task.id === id)!.notes;
		expect(await notesOf(added)).toBe('1. Open Home');
		await call('edit_task', {task: added, notes: '1. Open Home\n2. Press t'});
		expect(await notesOf(added)).toBe('1. Open Home\n2. Press t');
		const {body} = await call('batch', {changes: [{tool: 'add_task', title: 'Check the web app', notes: 'Open it'}, {tool: 'edit_task', task: added, notes: 'Done by hand'}]});
		expect(await notesOf(body.results[0].id)).toBe('Open it');
		expect(await notesOf(added)).toBe('Done by hand');
		expect(mcp.getInstructions()).toContain('everything the user needs to do it, step by step, in its notes');
	});

	it('sets a Task\'s deadline and Checklist when adding or editing it, alone or in a batch', async () => {
		const id = (await call('add_task', {title: 'Renew the passport', deadline: {kind: 'by_day', day: '2099-01-01'}, checklist: [{title: 'Get a photo taken'}]})).body.id;
		const [step] = (await call('get_task', {task: id})).body.checklist;
		expect(step).toEqual({id: expect.any(String), title: 'Get a photo taken', done: false});
		await call('edit_task', {task: id, deadline: {kind: 'none'}, checklist: [{...step, done: true}, {title: 'Fill in the form'}]});
		expect(await client.task(id)).toMatchObject({deadline: {kind: 'none'}, checklist: [{id: step.id, done: true}, {title: 'Fill in the form', done: false}]});
		const {body} = await call('batch', {changes: [
			{tool: 'add_task', title: 'Book the van', deadline: {kind: 'by_day', day: '2099-02-01'}, checklist: [{title: 'Compare prices'}]},
			{tool: 'edit_task', task: id, deadline: {kind: 'by_day', day: '2099-03-01'}, checklist: []},
		]});
		expect(await client.task(body.results[0].id)).toMatchObject({deadline: {kind: 'by_day', day: '2099-02-01'}, checklist: [{title: 'Compare prices'}]});
		expect(await client.task(id)).toMatchObject({deadline: {kind: 'by_day', day: '2099-03-01'}, checklist: []});
		expect((await call('add_task', {title: 'Pay rent', deadline: {kind: 'by_day', day: 'soon'}})).isError).toBe(true);
	});

	it('places Tasks and new Threads in their list, alone or in a batch, and lists Tasks in my order', async () => {
		const a = (await call('add_task', {title: 'A', when: {kind: 'today'}})).body.id;
		await call('add_task', {title: 'B', when: {kind: 'today'}});
		await call('add_task', {title: 'First', when: {kind: 'today'}, position: 0});
		await call('add_task', {title: 'In the Inbox'});
		const titles = async () => (await call('find_tasks')).body.map((t: any) => t.title);
		expect(await titles()).toEqual(['In the Inbox', 'First', 'A', 'B']);
		await call('edit_task', {task: a, position: 2});
		expect(await titles()).toEqual(['In the Inbox', 'First', 'B', 'A']);
		await call('batch', {changes: [{tool: 'edit_task', task: a, position: 0}, {tool: 'create_thread', title: 'Plan the move', position: 0}]});
		expect(await titles()).toEqual(['In the Inbox', 'A', 'First', 'B']);
		expect((await call('find_threads')).body.filter((t: any) => t.parent === 'Build the MCP server').map((t: any) => t.title)).toEqual(['Plan the move']);
		const second = (await call('create_thread', {title: 'Plan the party', position: 0})).body.id;
		expect((await call('find_threads')).body.filter((t: any) => t.parent === 'Build the MCP server').map((t: any) => t.id)[0]).toBe(second);
	});

	it('finds done and dropped Tasks only when asked', async () => {
		const ids: string[] = [];
		for (const title of ['Check the panel', 'Check the web app', 'Check the phone']) ids.push((await call('add_task', {title})).body.id);
		await call('edit_task', {task: ids[0], ended: 'done'});
		await call('edit_task', {task: ids[1], ended: 'dropped'});
		await call('edit_task', {task: ids[2], ended: 'done'});
		expect((await call('find_tasks')).body).toEqual([]);
		// The order comes from the Logbook, which is tested on its own; ends in
		// the same millisecond would tie here.
		expect((await call('find_tasks', {ended: 'done'})).body.map((t: any) => [t.title, t.ended]).sort()).toEqual([['Check the panel', 'done'], ['Check the phone', 'done']]);
		expect((await call('find_tasks', {ended: 'dropped', query: 'web'})).body.map((t: any) => t.title)).toEqual(['Check the web app']);
	});

	it('reads one Task whole, with its Notes and Checklist', async () => {
		const id = (await call('add_task', {title: 'Check the panel', notes: '1. Open Home'})).body.id;
		const checklist = [{id: 'a', title: 'Open Home', done: true}];
		await client.editTask(id, {checklist, deadline: {kind: 'by_day', day: '2099-01-01'}});
		expect((await call('get_task', {task: id})).body).toEqual({
			id, title: 'Check the panel', list: 'inbox', when: {kind: 'inbox'}, deadline: {kind: 'by_day', day: '2099-01-01'}, ended: 'not_ended',
			thread: {id: mine, title: 'Build the MCP server'}, belongsTo: {kind: 'none'}, notes: '1. Open Home', checklist,
		});
		expect((await call('get_task', {task: 'missing'})).isError).toBe(true);
	});

	it('tells the Session when I edited its Thread by hand', async () => {
		await call('update_thread', {summary: 'Mine.', next_step: 'Next', whose_move: 'on_me'});
		expect((await call('get_thread')).body.editedByUserSinceYourLastUpdate).toBe(false);
		await client.edit(mine, {nextStep: 'Do it my way'});
		const {body} = await call('get_thread');
		expect(body).toMatchObject({editedByUserSinceYourLastUpdate: true, nextStep: 'Do it my way'});
	});

	it('sends prompts and starts Sessions through todos, for the laptop to deliver', async () => {
		await client.edit(sibling, {directory: '/work/tui'});
		await client.signal(sibling, 'finished');
		expect((await call('send_prompt', {thread: sibling, prompt: 'Add keys'})).body.note).toMatch(/typed in/);
		await client.signal(sibling, null);
		expect((await call('start_session', {thread: sibling, claude_session: 'earlier'})).body.note).toMatch(/starts in the background/);
		const [sent, start] = await client.prompts();
		expect(sent!.text).toBe(
			'From the Session of the todos Thread "Build the MCP server", which the user asked to send you this. ' +
			"Treat it as the user's instruction. Reply to that Session with send_prompt only if this asks you to.\n\nAdd keys",
		);
		expect(start!.text).toBeNull();
		expect(mcp.getInstructions()).toContain('write it as a full brief');
		expect((await client.thread(sibling)).claudeSessionId).toBe('earlier');
	});

	it('refuses a prompt to its own Thread, to one with no Directory, and adopting into a running Session', async () => {
		expect((await call('send_prompt', {thread: mine, prompt: 'Hi'})).isError).toBe(true);
		expect((await call('send_prompt', {thread: sibling, prompt: 'Hi'})).body.error).toMatch(/no Directory/);
		await client.edit(sibling, {directory: '/work/tui'});
		await client.signal(sibling, 'busy');
		expect((await call('start_session', {thread: sibling, claude_session: 'earlier'})).isError).toBe(true);
		expect(await client.prompts()).toEqual([]);
	});
});
