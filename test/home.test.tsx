import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {Box, render as renderInk, Text} from 'ink';
import {render} from 'ink-testing-library';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {Client, Seen} from '../src/client/client.js';
import {childrenOf, type Thread} from '../src/core/thread.js';
import {Home, hintLines, homeRenderOptions, restoreFocusAndSelection} from '../src/home/home.js';
import {startApi} from './support.js';

let client: Client;
let stop: () => Promise<void>;
let opened: Array<{title: string; directory: string}>;

const settle = () => new Promise(resolve => setTimeout(resolve, 300));

const show = () =>
	render(
		<Home
			client={client}
			open={(thread: Thread, directory: string) => {
				opened.push({title: thread.title, directory});
				return {sessionPane: '%9', claudeSessionId: 'session-1'};
			}}
			livePanes={() => new Set(['%9'])}
			leave={() => {}}
			launchDir="/work"
			pollMs={50}
			now={() => new Date(Date.now() + 3 * 60 * 60_000)}
		/>,
	);

beforeEach(async () => {
	({client, stop} = await startApi());
	opened = [];
	const launch = await client.create('Launch v1');
	const mcp = await client.create('Build the MCP server', launch.id);
	await client.create('Write the docs', launch.id);
	await client.edit(mcp.id, {whoseMove: 'waiting', summary: 'Tools are done.', nextStep: 'Waiting on CI'});
	await client.edit(launch.id, {directory: '/work/todos'});
	await client.create('Move house');
});

afterEach(() => stop());

const keys = async (stdin: {write: (data: string) => void}, ...presses: string[]) => {
	await settle();
	for (const press of presses) {
		stdin.write(press);
		await settle();
	}
};

// The title on the selected row, without the tree lines or the details beside it.
const selectedTitle = (frame: string) =>
	frame.split('\n').find(line => line.includes('›'))?.replace(/[›├└─●▸]/g, '').trim().split(/\s{2,}/)[0];

describe('Home', () => {
	it('draws the tree with tree lines and nothing after the titles', async () => {
		const {lastFrame, unmount} = show();
		await settle();
		const frame = lastFrame()!;
		expect(frame).toContain('Home');
		expect(frame).toContain('› ● Launch v1');
		expect(frame).toMatch(/├── ● Build the MCP server\s+│/);
		expect(frame).toMatch(/└── ● Write the docs\s+│/);
		expect(frame).not.toContain('waiting on');
		unmount();
	});

	it('shows the selected Thread details, with when its summary last changed', async () => {
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, 'j');
		const frame = lastFrame()!;
		expect(frame).toContain('waiting');
		expect(frame).toContain('/work/todos');
		expect(frame).toContain('Summary updated 3 hours ago');
		expect(frame).toContain('Tools are done.');
		expect(frame).toContain('Next: Waiting on CI');
		unmount();
	});

	it('shows a project and its area as parents of the Threads in them, and only then', async () => {
		const software = await client.createArea({title: 'Software', notes: 'Everything I build.'});
		const todos = await client.createProject({title: 'Build todos', area: {kind: 'in', id: software.id}, deadline: {kind: 'by_day', day: '2099-01-01'}});
		await client.createProject({title: 'Plan a kitchen refit'});
		const launch = (await client.threads()).find(thread => thread.title === 'Launch v1')!;
		await client.edit(launch.id, {belongs: {kind: 'project', id: todos.id}, notes: 'Ship it.'});
		await client.editProject(todos.id, {notes: 'A calm app.'});
		const {lastFrame, stdin, unmount} = show();
		await settle();
		const frame = lastFrame()!;
		expect(frame).toMatch(/■ Software/);
		expect(frame).toMatch(/└── ◆ Build todos  ⚑/);
		expect(frame).toMatch(/└── ● Launch v1/);
		expect(frame).toMatch(/● Move house/);
		expect(frame).not.toContain('Plan a kitchen refit');
		expect(frame.indexOf('Software')).toBeLessThan(frame.indexOf('Move house'));
		expect(frame).toContain('Everything I build.');
		await keys(stdin, 'j');
		expect(lastFrame()).toContain('A calm app.');
		expect(lastFrame()).toContain('Project');
		await keys(stdin, 'j');
		expect(lastFrame()).toContain('Software  ›  Build todos');
		unmount();
	});

	it('only folds, moves and adds a Thread on a project row, and says to change it in the web app', async () => {
		const todos = await client.createProject({title: 'Build todos'});
		const launch = (await client.threads()).find(thread => thread.title === 'Launch v1')!;
		await client.edit(launch.id, {belongs: {kind: 'project', id: todos.id}});
		const {lastFrame, stdin, unmount} = show();
		for (const press of ['x', 'e', 's', 'J', '\r']) {
			await keys(stdin, press);
			expect(lastFrame()).toContain('Change projects and areas in the web app');
		}
		expect(opened).toEqual([]);
		expect((await client.projects()).find(project => project.id === todos.id)!.ended).toBe('not_ended');
		await keys(stdin, 'z');
		expect(lastFrame()).toMatch(/▸ Build todos/);
		expect(lastFrame()).not.toContain('Launch v1');
		await keys(stdin, 'a');
		expect(lastFrame()).toContain('New Thread in Build todos');
		await keys(stdin, 'Plan the launch', '\r');
		const made = (await client.threads()).find(thread => thread.title === 'Plan the launch')!;
		expect(made.parentId).toBe(null);
		expect(made.belongs).toEqual({kind: 'project', id: todos.id});
		expect(lastFrame()).toMatch(/└── ● Plan the launch/);
		unmount();
	});

	it('shows the Summary\'s Markdown as a terminal can', async () => {
		const launch = (await client.threads()).find(t => t.title === 'Launch v1')!;
		await client.edit(launch.id, {summary: '- **Ready** to ship\n- See [the docs](https://example.com) and `npm test`'});
		const {lastFrame, unmount} = show();
		await settle();
		expect(lastFrame()).toContain('• Ready to ship');
		expect(lastFrame()).toContain('• See the docs and npm test');
		unmount();
	});

	it('steps whose move with e, parks with s, and brings a Thread back in from the bring-in view', async () => {
		const {lastFrame, stdin, unmount} = show();
		const mcp = () => client.threads().then(list => list.find(t => t.title === 'Build the MCP server')!);
		await keys(stdin, 'j', 'e');
		expect((await mcp()).whoseMove).toBe('on_me');
		await keys(stdin, 's');
		expect((await mcp()).when).toEqual({kind: 'someday'});
		// It stays, dimmed, for a moment before the gap closes.
		expect(lastFrame()).toContain('Build the MCP server');
		await new Promise(resolve => setTimeout(resolve, 600));
		await settle();
		expect(lastFrame()).not.toContain('Build the MCP server');
		await keys(stdin, '.');
		expect(lastFrame()).toMatch(/Build the MCP server\s+someday/);
		while (selectedTitle(lastFrame()!) !== 'Build the MCP server') await keys(stdin, 'j');
		await keys(stdin, 's');
		expect((await mcp()).when).toEqual({kind: 'active'});
		expect((await mcp()).whoseMove).toBe('on_me');
		unmount();
	});

	it('types a new child with a and a new top-level Thread with A in place in the tree', async () => {
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, 'a', 'Write the landing page');
		const at = (title: string) => lastFrame()!.indexOf(title);
		expect(at('Write the docs')).toBeLessThan(at('Write the landing page'));
		expect(at('Write the landing page')).toBeLessThan(at('Move house'));
		await keys(stdin, '\r');
		expect(selectedTitle(lastFrame()!)).toBe('Write the landing page');
		await keys(stdin, 'A', 'Learn Japanese');
		expect(selectedTitle(lastFrame()!)).toBe('Learn Japanese');
		await keys(stdin, '\r');
		const threads = await client.threads();
		const launch = threads.find(t => t.title === 'Launch v1')!;
		expect(threads.find(t => t.title === 'Write the landing page')?.parentId).toBe(launch.id);
		expect(childrenOf(threads, null).map(t => t.title)).toEqual(['Launch v1', 'Learn Japanese', 'Move house']);
		expect(selectedTitle(lastFrame()!)).toBe('Learn Japanese');
		unmount();
	});

	it('leaves the tree as it was on Esc or an empty title', async () => {
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, 'z', 'a');
		expect(lastFrame()).toContain('Write the docs');
		await keys(stdin, '\u001B');
		expect(lastFrame()).not.toContain('Write the docs');
		await keys(stdin, 'f', 'A');
		expect(lastFrame()).not.toContain('Focused on');
		expect(lastFrame()).toContain('Move house');
		await keys(stdin, '\r');
		expect(lastFrame()).toContain('Focused on Launch v1');
		expect(await client.threads()).toHaveLength(4);
		unmount();
	});

	it('focuses on a Thread with f and leaves with f or Esc', async () => {
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, 'f');
		expect(lastFrame()).toContain('Focused on Launch v1');
		expect(lastFrame()).not.toContain('Move house');
		await keys(stdin, 'f');
		expect(lastFrame()).toContain('Move house');
		await keys(stdin, 'j', 'f');
		expect(lastFrame()).toContain('Focused on Build the MCP server');
		expect(lastFrame()).not.toContain('Write the docs');
		await keys(stdin, '\u001B');
		expect(lastFrame()).toContain('Write the docs');
		unmount();
	});

	it('searches titles with / and steps through matches with n and N', async () => {
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, 'z', '/', 'the', '\r');
		expect(selectedTitle(lastFrame()!)).toBe('Build the MCP server');
		await keys(stdin, 'n');
		expect(selectedTitle(lastFrame()!)).toBe('Write the docs');
		await keys(stdin, 'N');
		expect(selectedTitle(lastFrame()!)).toBe('Build the MCP server');
		unmount();
	});

	it('jumps between On me Threads with [ and ]', async () => {
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, ']');
		expect(selectedTitle(lastFrame()!)).toBe('Write the docs');
		await keys(stdin, ']');
		expect(selectedTitle(lastFrame()!)).toBe('Move house');
		await keys(stdin, '[', '[');
		expect(selectedTitle(lastFrame()!)).toBe('Launch v1');
		unmount();
	});

	it('keeps a Thread marked Done in view until I move away, and shows it with , where x reopens it', async () => {
		const {lastFrame, stdin, unmount} = show();
		const docs = () => client.threads().then(list => list.find(t => t.title === 'Write the docs')!);
		await keys(stdin, 'j', 'j', 'x');
		expect((await docs()).ended).toBe('done');
		expect(lastFrame()).toMatch(/Write the docs\s+done/);
		await keys(stdin, 'k');
		expect(lastFrame()).not.toContain('Write the docs');
		await keys(stdin, ',');
		expect(lastFrame()).toContain('Ended');
		expect(selectedTitle(lastFrame()!)).toBe('Write the docs');
		await keys(stdin, 'x');
		expect((await docs()).ended).toBe('not_ended');
		unmount();
	});

	it('goes back to Active to type a new Thread when the ended view shows', async () => {
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, ',', 'A');
		expect(lastFrame()).not.toContain('Ended');
		await keys(stdin, 'Plan the launch', '\r');
		expect(selectedTitle(lastFrame()!)).toBe('Plan the launch');
		unmount();
	});

	it('goes into a Thread with Enter, in its inherited Directory', async () => {
		const {stdin, unmount} = show();
		await keys(stdin, 'j', '\r');
		expect(opened).toEqual([{title: 'Build the MCP server', directory: '/work/todos'}]);
		const mcp = (await client.threads()).find(t => t.title === 'Build the MCP server')!;
		expect(mcp).toMatchObject({sessionPane: '%9', claudeSessionId: 'session-1'});
		unmount();
	});

	it('folds with z, folds the parent when z is pressed on a child, and unfolds all with Z', async () => {
		const {lastFrame, stdin, unmount} = show();
		await keys(stdin, 'z');
		expect(lastFrame()).not.toContain('Build the MCP server');
		expect(lastFrame()).toContain('▸ Launch v1');
		await keys(stdin, 'Z');
		expect(lastFrame()).toContain('Build the MCP server');
		await keys(stdin, 'j', 'z');
		expect(lastFrame()).not.toContain('Build the MCP server');
		await keys(stdin, 'Z', 'Z');
		expect(lastFrame()).not.toContain('Build the MCP server');
		unmount();
	});

	it('breaks the key hints into centred lines at the dots', () => {
		expect(hintLines('j k move · e state · q quit', 18)).toEqual(['j k move · e state', 'q quit']);
	});
});

describe('Home while nobody can see it', () => {
	it('stops asking todos for changes, and starts again once it is shown', async () => {
		let shown = false;
		let asked = 0;
		const counting = new Proxy(client, {
			get: (target, name) => (name === 'changes' ? (seen: Seen) => (asked++, target.changes(seen)) : Reflect.get(target, name)),
		});
		const {unmount} = render(
			<Home client={counting} open={() => ({sessionPane: '%9', claudeSessionId: 's'})} livePanes={() => new Set()} leave={() => {}} launchDir="/work" pollMs={20} shown={() => shown} />,
		);
		await settle();
		const hidden = asked;
		await settle();
		expect(asked).toBe(hidden);
		shown = true;
		await settle();
		expect(asked).toBeGreaterThan(hidden);
		unmount();
	});
});

describe('Home\'s focus and selection kept between runs', () => {
	const byTitle = async (title: string) => (await client.threads()).find(thread => thread.title === title)!.id;

	it('keeps both while the Threads are still open', async () => {
		const [launch, docs] = [await byTitle('Launch v1'), await byTitle('Write the docs')];
		expect(restoreFocusAndSelection({focusId: launch, selectedId: docs}, await client.threads(), new Set())).toEqual({focusId: launch, selectedId: docs});
	});

	it('moves the cursor to the focused Thread when the selected one has ended, gone or left the focus', async () => {
		const [launch, docs, house] = [await byTitle('Launch v1'), await byTitle('Write the docs'), await byTitle('Move house')];
		await client.edit(docs, {ended: 'done'});
		const threads = await client.threads();
		for (const selectedId of [docs, 'gone', house]) {
			expect(restoreFocusAndSelection({focusId: launch, selectedId}, threads, new Set())).toEqual({focusId: launch, selectedId: launch});
		}
	});

	it('opens unfocused when the focused Thread has ended or gone, keeping a selection that is still open', async () => {
		const [launch, house] = [await byTitle('Launch v1'), await byTitle('Move house')];
		await client.edit(launch, {ended: 'dropped'});
		const threads = await client.threads();
		expect(restoreFocusAndSelection({focusId: launch, selectedId: launch}, threads, new Set())).toEqual({focusId: null, selectedId: null});
		expect(restoreFocusAndSelection({focusId: 'gone', selectedId: house}, threads, new Set())).toEqual({focusId: null, selectedId: house});
	});

	it('keeps a selected project or area only while nothing is focused', async () => {
		const launch = await byTitle('Launch v1');
		const threads = await client.threads();
		expect(restoreFocusAndSelection({focusId: null, selectedId: 'project-1'}, threads, new Set(['project-1']))).toEqual({focusId: null, selectedId: 'project-1'});
		expect(restoreFocusAndSelection({focusId: launch, selectedId: 'project-1'}, threads, new Set(['project-1']))).toEqual({focusId: launch, selectedId: launch});
	});
});

describe('Home render options', () => {
	it('rewrites only the changed line instead of erasing the whole screen', () => {
		vi.useFakeTimers();
		try {
			const writes: string[] = [];
			const stdout = Object.assign(new EventEmitter(), {
				isTTY: true,
				columns: 40,
				rows: 5,
				write: (chunk: string) => (writes.push(chunk), true),
			}) as unknown as NodeJS.WriteStream;
			const frame = (last: string) => (
				<Box flexDirection="column" height={5}>
					{['a', 'b', 'c', 'd', last].map(line => <Text key={line}>{line}</Text>)}
				</Box>
			);
			const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
			const app = renderInk(frame('shimmer 1'), {...homeRenderOptions, stdout, stdin, patchConsole: false});
			vi.advanceTimersByTime(100);
			writes.length = 0;
			app.rerender(frame('shimmer 2'));
			vi.advanceTimersByTime(100);
			const written = writes.join('');
			expect(written).toContain('2');
			// Erase Line, which the default rendering sends for every line of the frame.
			expect(written).not.toContain('\x1b[2K');
			app.unmount();
		} finally {
			vi.useRealTimers();
		}
	});
});
