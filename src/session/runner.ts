// Takes me into a Thread's Session on todos' own tmux server, whatever state
// it is in: switching to it, bringing it back, or starting it. It also opens
// and closes the task panel, a pane on the right of any todos window, and
// Thoughts, a strip along the bottom.

import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import type {Thread} from '../core/thread.js';
import {homeWindow, tasksPaneWidth, thoughtsHeight, tmuxSession} from './tmux-config.js';
import type {Tmux} from './tmux.js';

export type SessionCommand = (start: {
	thread: Thread;
	sessionId: string;
	resume: boolean;
	prompt?: string;
}) => {command: string[]; env: Record<string, string>};

export type OpenResult = {sessionPane: string; claudeSessionId: string};

export class SessionRunner {
	constructor(
		private readonly tmux: Tmux,
		private readonly sessionCommand: SessionCommand,
		private readonly canResume: (directory: string, sessionId: string) => boolean,
	) {}

	isRunning(): boolean {
		return this.tmux.tryRun(['has-session', '-t', `=${tmuxSession}`]) !== null;
	}

	// Starts the server with Home in its first window, if it is not running.
	ensureStarted(home: {command: string[]; directory: string; env: Record<string, string>}): void {
		if (this.isRunning()) return;
		this.tmux.run([
			'new-session', '-d', '-s', tmuxSession, '-n', 'home', '-c', home.directory,
			...envArgs(home.env), ...home.command,
		]);
	}

	// Replaces whatever runs in Home's pane with a fresh Home, leaving every
	// Thread's window alone.
	restartHome(home: {command: string[]; env: Record<string, string>}): void {
		// Home is the window's first pane; the task panel may be open beside it.
		this.tmux.run(['respawn-pane', '-k', '-t', `${homeWindow}.0`, ...envArgs(home.env), ...home.command]);
	}

	// The build of todos that Home is running, as Home recorded it.
	homeBuild(): string | null {
		return this.tmux.tryRun(['show-options', '-wqv', '-t', homeWindow, '@todos_build']) || null;
	}

	markHomeBuild(build: string): void {
		this.tmux.run(['set-option', '-w', '-t', homeWindow, '@todos_build', build]);
	}

	goHome(): void {
		this.tmux.run(['select-window', '-t', homeWindow]);
	}

	livePanes(): Set<string> {
		const out = this.tmux.tryRun(['list-panes', '-a', '-F', '#{pane_id}']) ?? '';
		return new Set(out.split('\n').filter(Boolean));
	}

	// `directory` is the Thread's own or inherited Directory, already worked out.
	open(thread: Thread, directory: string): OpenResult {
		// The task panel and Thoughts start closed whenever I go into a Thread.
		const existing = this.windowOf(thread.id);
		if (existing) {
			this.closeTasks(existing);
			const thoughts = this.thoughtsPane();
			if (thoughts?.window === existing) this.putAwayThoughts(thoughts.pane);
		}
		if (thread.sessionPane && this.livePanes().has(thread.sessionPane)) {
			this.show(thread.sessionPane);
			return {sessionPane: thread.sessionPane, claudeSessionId: thread.claudeSessionId ?? ''};
		}

		const result = this.start(thread, directory);
		this.show(result.sessionPane);
		return result;
	}

	// Starts a Thread's Session without going to it, fresh or resuming its
	// conversation, with `prompt` as its first if one was sent.
	start(thread: Thread, directory: string, prompt?: string): OpenResult {
		// tmux would quietly start it in my home folder instead.
		if (!existsSync(directory)) throw new Error(`There is no folder at ${directory}`);
		const resume = thread.claudeSessionId !== null && this.canResume(directory, thread.claudeSessionId);
		// A conversation kept under another folder still holds its id, and
		// Claude exits at once if a fresh one is given it, so it gets a new id.
		const sessionId = resume ? thread.claudeSessionId! : randomUUID();
		const {command, env} = this.sessionCommand({thread, sessionId, resume, prompt});
		const window = this.windowOf(thread.id);
		const created = window
			? this.tmux.run(['split-window', '-d', '-t', window, '-c', directory, '-P', '-F', '#{pane_id}', ...envArgs(env), ...command])
			: this.tmux.run([
				'new-window', '-d', '-t', `${tmuxSession}:`, '-n', thread.title, '-c', directory,
				'-P', '-F', '#{pane_id}', ...envArgs(env), ...command,
			]);
		const sessionPane = created.trim();
		if (!window) this.tmux.run(['set-option', '-w', '-t', sessionPane, '@todos_thread', thread.id]);
		this.tmux.run(['set-option', '-w', '-t', sessionPane, '@todos_directory', directory]);
		return {sessionPane, claudeSessionId: sessionId};
	}

	// Types a prompt into a Session's pane and sends it, as if I typed it.
	// Pasting keeps a prompt of several lines as one message.
	// shortcut: anything I left half typed in that pane is sent along with
	// it; clear the line first if that ever bites.
	type(pane: string, text: string): void {
		this.tmux.run(['set-buffer', '-b', 'todos-prompt', '--', text]);
		this.tmux.run(['paste-buffer', '-p', '-d', '-b', 'todos-prompt', '-t', pane]);
		this.tmux.run(['send-keys', '-t', pane, 'Enter']);
	}

	// Opens the task panel on the right of the window, with the focus in it,
	// or closes it if it is open, which gives the focus back.
	toggleTasks(window: string, panel: {command: string[]; env: Record<string, string>}): void {
		if (this.closeTasks(window)) return;
		const thread = this.tmux.tryRun(['show-options', '-wqv', '-t', window, '@todos_thread']) || '';
		// With Thoughts open along the bottom, the panel goes beside the top pane only.
		const where = this.thoughtsPane()?.window === window ? ['-t', this.mainPane(window)] : ['-f', '-t', window];
		const pane = this.tmux.run([
			'split-window', '-h', '-l', String(tasksPaneWidth), ...where, '-P', '-F', '#{pane_id}',
			...envArgs({...panel.env, TODOS_THREAD: thread}), ...panel.command,
		]);
		this.tmux.run(['set-option', '-p', '-t', pane, '@todos_tasks', '1']);
	}

	// Returns whether a panel was open.
	closeTasks(window: string): boolean {
		const out = this.tmux.tryRun(['list-panes', '-t', window, '-F', '#{pane_id} #{@todos_tasks}']) ?? '';
		const pane = out.split('\n').find(row => row.endsWith(' 1'))?.split(' ')[0];
		if (pane) this.tmux.run(['kill-pane', '-t', pane]);
		return Boolean(pane);
	}

	// Opens Thoughts as a strip along the bottom of the window with the focus
	// in it, or puts it away. There is only ever one: it is brought from
	// wherever it is, with whatever is not saved yet, so there is never an
	// older copy to save over a newer one.
	toggleThoughts(window: string, thoughts: {command: string[]; env: Record<string, string>}): void {
		const open = this.thoughtsPane();
		if (!open) {
			const pane = this.tmux.run([
				'split-window', '-v', '-f', '-l', thoughtsHeight, '-t', window, '-P', '-F', '#{pane_id}',
				...envArgs(thoughts.env), ...thoughts.command,
			]);
			this.tmux.run(['set-option', '-p', '-t', pane, '@todos_thoughts', '1']);
		} else if (open.window === window) {
			this.putAwayThoughts(open.pane);
		} else {
			this.tmux.run(['join-pane', '-v', '-f', '-l', thoughtsHeight, '-s', open.pane, '-t', window]);
			// Emptying the window it was kept in sends me to Home, so come back.
			this.tmux.run(['select-window', '-t', window]);
			this.tmux.run(['select-pane', '-t', open.pane]);
		}
	}

	// Moves Thoughts into a window of its own that nothing shows, still running.
	putAwayThoughts(pane: string): void {
		const kept = this.tmux.run(['break-pane', '-d', '-s', pane, '-n', 'thoughts', '-P', '-F', '#{window_id}']);
		this.tmux.run(['set-option', '-w', '-t', kept, '@todos_kept', '1']);
	}

	// Once the Session's pane has gone, Thoughts would keep its window open,
	// so it is put away and the window can close.
	putAwayThoughtsIfAlone(pane: string): void {
		const out = this.tmux.tryRun(['list-panes', '-t', pane, '-F', '#{@todos_kept}|#{@todos_thoughts}|#{@todos_tasks}']);
		if (!out || out.startsWith('1|')) return;
		if (out.split('\n').some(row => row.endsWith('||'))) return;
		// tmux cannot break out a window's only pane, so the window itself is
		// kept, no longer the Thread's, and I go to Home as when a window closes.
		const active = this.tmux.run(['display-message', '-p', '-t', pane, '#{window_active}']) === '1';
		this.tmux.run(['set-option', '-w', '-u', '-t', pane, '@todos_thread']);
		this.tmux.run(['set-option', '-w', '-t', pane, '@todos_kept', '1']);
		this.tmux.run(['rename-window', '-t', pane, 'thoughts']);
		if (active) this.goHome();
	}

	private thoughtsPane(): {pane: string; window: string} | null {
		const out = this.tmux.tryRun(['list-panes', '-s', '-t', `=${tmuxSession}`, '-F', '#{pane_id} #{window_id} #{@todos_thoughts}']) ?? '';
		const [pane, window] = out.split('\n').find(row => row.endsWith(' 1'))?.split(' ') ?? [];
		return pane && window ? {pane, window} : null;
	}

	// Home's pane or the Session's, whichever is neither panel.
	private mainPane(window: string): string {
		const out = this.tmux.run(['list-panes', '-t', window, '-F', '#{pane_id} #{@todos_thoughts}#{@todos_tasks}']);
		return out.split('\n').find(row => row.endsWith(' '))?.trim() ?? window;
	}

	private windowOf(threadId: string): string | null {
		const out = this.tmux.tryRun(['list-windows', '-t', `=${tmuxSession}`, '-F', '#{window_id} #{@todos_thread}']) ?? '';
		const line = out.split('\n').find(row => row.split(' ')[1] === threadId);
		return line?.split(' ')[0] ?? null;
	}

	private show(pane: string): void {
		this.tmux.run(['select-window', '-t', pane]);
		this.tmux.run(['select-pane', '-t', pane]);
	}
}

const envArgs = (env: Record<string, string>): string[] =>
	Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
