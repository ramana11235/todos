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

// The capture popup's display-popup -b and -S flags, and its rounded border,
// first came in tmux 3.3.
export const minimumTmux = '3.3';

// Takes what `tmux -V` prints, such as "tmux 3.5a" or "tmux next-3.6". A build
// that names no version, such as "tmux master" from source, is let through,
// because a build from source is usually newer than the latest release.
export function tmuxIsNewEnough(versionOutput: string): boolean {
	const found = /^tmux (?:next-)?(\d+)\.(\d+)/.exec(versionOutput);
	if (!found) return true;
	const [major, minor] = minimumTmux.split('.').map(Number);
	const [foundMajor, foundMinor] = [Number(found[1]), Number(found[2])];
	return foundMajor > major! || (foundMajor === major && foundMinor >= minor!);
}

// Calls to our own tmux server must not be confused by an outer tmux.
function withoutTmux(): NodeJS.ProcessEnv {
	const env = {...process.env};
	delete env.TMUX;
	delete env.TMUX_PANE;
	return env;
}
