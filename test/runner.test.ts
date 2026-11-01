import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {Thread} from '../src/core/thread.js';
import {SessionRunner, type SessionCommand} from '../src/session/runner.js';
import {tmuxConfig} from '../src/session/tmux-config.js';
import {Tmux} from '../src/session/tmux.js';

let tmux: Tmux;
let runner: SessionRunner;
let starts: Array<{sessionId: string; resume: boolean}>;
let resumable: Set<string>;
const dir = mkdtempSync(join(tmpdir(), 'todos-runner-'));

const thread = (overrides: Partial<Thread> = {}): Thread => ({
	id: 'thread-1', title: 'Build the MCP server', summary: '', nextStep: '', notes: '',
	whoseMove: 'on_me', when: {kind: 'active'}, ended: 'not_ended', deadline: {kind: 'none'}, state: 'on_me',
	parentId: null, position: 0, directory: null, claudeSessionId: null, sessionPane: null, sessionSignal: null,
	myEditAt: null, sessionUpdateAt: null, summaryUpdatedAt: null, createdAt: '', ...overrides,
});

const fakeClaude: SessionCommand = ({thread, sessionId, resume}) => {
	starts.push({sessionId, resume});
	return {command: ['sleep', '600'], env: {TODOS_THREAD: thread.id}};
};

const currentPane = () => tmux.run(['display-message', '-p', '-t', 'todos', '#{pane_id}']);
const currentWindowName = () => tmux.run(['display-message', '-p', '-t', 'todos', '#{window_name}']);

beforeEach(() => {
	const configPath = join(dir, `tmux-${Math.random()}.conf`);
	writeFileSync(configPath, tmuxConfig());
	tmux = new Tmux(`todos-test-${process.pid}-${Math.random().toString(36).slice(2)}`, configPath);
	starts = [];
	resumable = new Set();
	runner = new SessionRunner(tmux, fakeClaude, (_, id) => resumable.has(id));
	runner.ensureStarted({command: ['sleep', '600'], directory: dir, env: {}});
});

afterEach(() => {
	const socketPath = tmux.tryRun(['display-message', '-p', '#{socket_path}']);
	tmux.tryRun(['kill-server']);
	if (socketPath) rmSync(socketPath, {force: true});
});

describe('the Session runner', () => {
	it('starts a Session in the background without going to it', () => {
		const result = runner.start(thread(), dir, 'Rerun CI');
		expect(currentWindowName()).toBe('home');
		expect(runner.livePanes().has(result.sessionPane)).toBe(true);
	});

	it('types a prompt into a pane as one message and sends it', async () => {
		const pane = tmux.run(['new-window', '-d', '-P', '-F', '#{pane_id}', 'cat']);
		runner.type(pane, 'Rerun CI\nthen tell me');
		await new Promise(resolve => setTimeout(resolve, 300));
		const shown = tmux.run(['capture-pane', '-p', '-t', pane]);
		expect(shown).toContain('Rerun CI');
		expect(shown).toContain('then tell me');
		expect(tmux.tryRun(['show-buffer', '-b', 'todos-prompt'])).toBeNull();
	});

	it('starts todos tmux with Home and no way to see other windows', () => {
		expect(currentWindowName()).toBe('home');
		expect(tmux.run(['show-options', '-gv', 'status'])).toBe('off');
		const prefixKeys = tmux.run(['list-keys', '-T', 'prefix']);
		expect(prefixKeys).not.toMatch(/next-window|previous-window|choose-tree|select-window -t :=1/);
		const rootKeys = tmux.run(['list-keys', '-T', 'root']);
		expect(rootKeys).toMatch(/M-h +select-window -t todos:home/);
		expect(rootKeys).toMatch(/M-x +run-shell -b .*toggle-tasks/);
		expect(rootKeys).toMatch(/M-c +display-popup .*capture/);
		expect(rootKeys).toMatch(/M-g +run-shell -b .*toggle-thoughts/);
		// Claude Code's own Alt keys are left for it.
		expect(rootKeys).not.toMatch(/ M-[optw] /);
	});

	it('starts a new Session in the Directory when the Thread has none', () => {
		const result = runner.open(thread(), dir);
		expect(starts).toEqual([{sessionId: result.claudeSessionId, resume: false}]);
		expect(currentPane()).toBe(result.sessionPane);
		expect(currentWindowName()).toBe('Build the MCP server');
		expect(tmux.run(['display-message', '-p', '-t', result.sessionPane, '#{pane_current_path}'])).toContain('todos-runner-');
	});

	it('splits a new pane in the Thread\'s Directory with prefix then % or "', () => {
		const directory = mkdtempSync(join(dir, 'thread-'));
		const first = runner.open(thread(), directory);
		// Like the task panel, a pane that was not started in the Directory.
		tmux.run(['split-window', '-t', first.sessionPane, '-c', dir, 'sleep', '600']);
		for (const key of ['%', '"']) {
			const bound = tmux.run(['list-keys', '-T', 'prefix', key]).replace(/^bind-key +-T prefix +\S+ +/, '');
			const commandPath = join(dir, `key-${Math.random()}.conf`);
			writeFileSync(commandPath, bound);
			tmux.run(['source-file', commandPath]);
			expect(tmux.run(['display-message', '-p', '-t', 'todos', '#{pane_current_path}'])).toContain(directory.split('/').pop());
		}
	});

	it('switches to the Session pane when it is still running', () => {
		const first = runner.open(thread(), dir);
		runner.goHome();
		expect(currentWindowName()).toBe('home');
		const again = runner.open(thread({sessionPane: first.sessionPane, claudeSessionId: first.claudeSessionId}), dir);
		expect(again.sessionPane).toBe(first.sessionPane);
		expect(starts).toHaveLength(1);
		expect(currentPane()).toBe(first.sessionPane);
	});

	it('resumes the conversation in a new window once the old one is gone', () => {
		const first = runner.open(thread(), dir);
		tmux.run(['kill-pane', '-t', first.sessionPane]);
		resumable.add(first.claudeSessionId);
		const again = runner.open(thread({sessionPane: first.sessionPane, claudeSessionId: first.claudeSessionId}), dir);
		expect(starts.at(-1)).toEqual({sessionId: first.claudeSessionId, resume: true});
		expect(again.sessionPane).not.toBe(first.sessionPane);
	});

	it('starts a fresh conversation with a new id when the old one cannot be resumed', () => {
		const again = runner.open(thread({claudeSessionId: 'kept-elsewhere'}), dir);
		expect(starts).toEqual([{sessionId: again.claudeSessionId, resume: false}]);
		expect(again.claudeSessionId).not.toBe('kept-elsewhere');
	});

	it('starts nothing in a Directory that does not exist', () => {
		expect(() => runner.open(thread(), join(dir, 'never-made'))).toThrow(/no folder at .*never-made/);
		expect(starts).toEqual([]);
		expect(currentWindowName()).toBe('home');
	});

	it('goes to Home when a Thread window closes', () => {
		const first = runner.open(thread(), dir);
		tmux.run(['kill-pane', '-t', first.sessionPane]);
		expect(currentWindowName()).toBe('home');
	});

	it('brings the Session back in a new pane of the same window, leaving my other panes alone', () => {
		const first = runner.open(thread(), dir);
		const mine = tmux.run(['split-window', '-t', first.sessionPane, '-P', '-F', '#{pane_id}', 'sleep', '600']);
		tmux.run(['kill-pane', '-t', first.sessionPane]);
		const again = runner.open(thread({sessionPane: first.sessionPane, claudeSessionId: first.claudeSessionId}), dir);
		const panes = tmux.run(['list-panes', '-t', again.sessionPane, '-F', '#{pane_id}']).split('\n');
		expect(panes).toContain(mine);
		expect(panes).toContain(again.sessionPane);
		expect(starts.at(-1)?.resume).toBe(false);
	});

	it('opens the task panel on the right with the focus in it, and closes it again', () => {
		const first = runner.open(thread(), dir);
		const window = tmux.run(['display-message', '-p', '-t', first.sessionPane, '#{window_id}']);
		runner.toggleTasks(window, {command: ['sleep', '600'], env: {}});
		const panel = currentPane();
		expect(panel).not.toBe(first.sessionPane);
		expect(tmux.run(['display-message', '-p', '-t', panel, '#{pane_width} #{pane_right}'])).toMatch(/^46 /);
		runner.toggleTasks(window, {command: ['sleep', '600'], env: {}});
		expect(currentPane()).toBe(first.sessionPane);
	});

	it('closes the task panel when I go into the Thread again', () => {
		const first = runner.open(thread(), dir);
		const window = tmux.run(['display-message', '-p', '-t', first.sessionPane, '#{window_id}']);
		runner.toggleTasks(window, {command: ['sleep', '600'], env: {}});
		runner.goHome();
		runner.open(thread({sessionPane: first.sessionPane, claudeSessionId: first.claudeSessionId}), dir);
		expect(tmux.run(['list-panes', '-t', window, '-F', '#{pane_id}'])).toBe(first.sessionPane);
	});

	describe('Thoughts', () => {
		const sleep = {command: ['sleep', '600'], env: {}};
		const windowOf = (pane: string) => tmux.run(['display-message', '-p', '-t', pane, '#{window_id}']);
		const layout = (window: string) => tmux.run(['list-panes', '-t', window, '-F',
			'#{pane_id} #{pane_left},#{pane_top} #{pane_width} #{window_width}']).split('\n');

		it('opens along the whole bottom with the focus in it, and puts it away still running', () => {
			const first = runner.open(thread(), dir);
			const window = windowOf(first.sessionPane);
			runner.toggleThoughts(window, sleep);
			const strip = currentPane();
			const [, place, width, windowWidth] = layout(window).find(row => row.startsWith(strip))!.split(' ');
			expect(place).toMatch(/^0,[1-9]/);
			expect(width).toBe(windowWidth);
			runner.toggleThoughts(window, sleep);
			expect(currentPane()).toBe(first.sessionPane);
			expect(tmux.run(['list-panes', '-a', '-F', '#{pane_id}'])).toContain(strip);
			runner.toggleThoughts(window, sleep);
			expect(currentPane()).toBe(strip);
		});

		it('is the same pane in every window, brought to the one I am in', () => {
			const first = runner.open(thread(), dir);
			runner.toggleThoughts(windowOf(first.sessionPane), sleep);
			const strip = currentPane();
			runner.goHome();
			const home = windowOf(currentPane());
			runner.toggleThoughts(home, sleep);
			expect(currentPane()).toBe(strip);
			expect(currentWindowName()).toBe('home');
			expect(tmux.run(['list-panes', '-a', '-F', '#{@todos_thoughts}']).split('\n').filter(Boolean)).toEqual(['1']);
		});

		it('leaves the bottom to Thoughts when the task panel opens beside it', () => {
			const first = runner.open(thread(), dir);
			const window = windowOf(first.sessionPane);
			runner.toggleThoughts(window, sleep);
			const stripPane = currentPane();
			runner.toggleTasks(window, sleep);
			const strip = layout(window).find(row => row.startsWith(stripPane))!;
			const panel = layout(window).find(row => row.startsWith(currentPane()))!;
			expect(panel.split(' ')[2]).toBe('46');
			expect(strip.split(' ')[2]).toBe(strip.split(' ')[3]);
		});

		it('starts put away when I go into the Thread again', () => {
			const first = runner.open(thread(), dir);
			const window = windowOf(first.sessionPane);
			runner.toggleThoughts(window, sleep);
			runner.goHome();
			runner.open(thread({sessionPane: first.sessionPane, claudeSessionId: first.claudeSessionId}), dir);
			expect(tmux.run(['list-panes', '-t', window, '-F', '#{pane_id}'])).toBe(first.sessionPane);
		});

		it('is put away once the Session has gone, so the window can close', () => {
			const first = runner.open(thread(), dir);
			runner.toggleThoughts(windowOf(first.sessionPane), sleep);
			const strip = currentPane();
			runner.putAwayThoughtsIfAlone(strip);
			expect(windowOf(strip)).toBe(windowOf(first.sessionPane));
			tmux.run(['kill-pane', '-t', first.sessionPane]);
			runner.putAwayThoughtsIfAlone(strip);
			expect(tmux.run(['show-options', '-wqv', '-t', strip, '@todos_kept'])).toBe('1');
			expect(currentWindowName()).toBe('home');
			runner.putAwayThoughtsIfAlone(strip);
			expect(tmux.run(['list-panes', '-a', '-F', '#{pane_id}'])).toContain(strip);
			// Going into the Thread again starts its Session in a window of its own.
			const again = runner.open(thread({sessionPane: first.sessionPane, claudeSessionId: first.claudeSessionId}), dir);
			expect(windowOf(again.sessionPane)).not.toBe(windowOf(strip));
		});
	});
});
