import {execFileSync, spawnSync} from 'node:child_process';

// A thin wrapper around one tmux server, chosen by its socket name.
export class Tmux {
	constructor(
		readonly socket: string,
		private readonly configPath: string,
	) {}

	run(args: string[]): string {
		return execFileSync('tmux', ['-L', this.socket, '-f', this.configPath, ...args], {
			encoding: 'utf8',
			env: withoutTmux(),
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trimEnd();
	}

	tryRun(args: string[]): string | null {
		try {
			return this.run(args);
		} catch {
			return null;
		}
	}

	// Hands this terminal over to tmux until I detach.
	attach(session: string): void {
		spawnSync('tmux', ['-L', this.socket, '-f', this.configPath, 'attach-session', '-t', session], {
			stdio: 'inherit',
			env: withoutTmux(),
		});
	}

	insideThisServer(): boolean {
		return (process.env.TMUX ?? '').split(',')[0]?.endsWith(`/${this.socket}`) ?? false;
	}
}

// Calls to our own tmux server must not be confused by an outer tmux.
function withoutTmux(): NodeJS.ProcessEnv {
	const env = {...process.env};
	delete env.TMUX;
	delete env.TMUX_PANE;
	return env;
}
