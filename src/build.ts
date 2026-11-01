// Which build of todos is running, so that a running API or Home can notice
// a newer build and restart into it, and the launcher can tell when a
// running one is out of date.

import {readdirSync, statSync, watch} from 'node:fs';
import {dirname, join} from 'node:path';
import type {ApiHealth} from './client/client.js';
import {fileURLToPath} from 'node:url';

const codeDirectory = dirname(fileURLToPath(import.meta.url));

// The newest change time of any file of running code. A build rewrites the
// files, so it changes whenever a new build lands. The web app is left out,
// because the API reads its files fresh for every request.
export function buildId(): string {
	let newest = 0;
	const web = join(codeDirectory, 'web');
	const visit = (directory: string) => {
		for (const entry of readdirSync(directory, {withFileTypes: true})) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (path !== web) visit(path);
			} else if (/\.(js|tsx?)$/.test(entry.name)) newest = Math.max(newest, statSync(path).mtimeMs);
		}
	};
	visit(codeDirectory);
	return String(Math.round(newest));
}

// Calls onNewBuild once a new build has finished landing. A build writes
// many files, so it waits for them to settle first.
export function onNewBuild(onNewBuild: () => void): void {
	const running = buildId();
	let timer: NodeJS.Timeout | undefined;
	watch(codeDirectory, {recursive: true}, () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (buildId() !== running) onNewBuild();
		}, 500);
	}).unref();
}

// What the launcher does with whatever API answers at its address: use it,
// replace it with this build, or refuse because it serves another Instance,
// whose API is not this Instance's to stop. An API from before Instances
// were told apart does not say its home.
export function apiAction(health: ApiHealth | null, mine: {build: string; home: string}): 'start' | 'use' | 'replace' | 'refuse' {
	if (!health) return 'start';
	if (health.home && health.home !== mine.home) return 'refuse';
	return health.build === mine.build ? 'use' : 'replace';
}
