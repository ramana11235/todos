import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import type {PushKeys} from './core/push.js';

// Where this Instance keeps its data. Setting TODOS_HOME gives a fully
// separate Instance, which is how tests run and how a work Instance stays
// apart.
export const todosHome = (): string => process.env.TODOS_HOME ?? join(homedir(), '.todos');

export const databasePath = (): string => join(todosHome(), 'todos.db');

export const apiPort = (): number => Number(process.env.TODOS_PORT ?? 7316);

// settings.json in a home says which Instance it uses. "local" runs its own
// API on this laptop; "hosted" uses the Instance at `url` with the laptop's
// Access service token, so the file is then readable only by its owner. With
// no file the Instance is local, so data only leaves the laptop when the file
// says so.
export type Settings = {instance: 'local'} | {instance: 'hosted'; url: string; clientId: string; clientSecret: string};

export const settingsPath = (): string => join(todosHome(), 'settings.json');

// The settings file as written, or nothing when there is none.
function settingsFile(): any {
	try {
		return JSON.parse(readFileSync(settingsPath(), 'utf8'));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}

export function settings(): Settings {
	const found = settingsFile();
	if (found === undefined) return {instance: 'local'};
	if (found?.instance === 'local') return {instance: 'local'};
	const given = (value: unknown) => typeof value === 'string' && value !== '';
	if (found?.instance === 'hosted' && given(found.url) && given(found.clientId) && given(found.clientSecret)) return found;
	throw new Error(`${settingsPath()} must say "instance": "local", or "instance": "hosted" with a url, clientId and clientSecret.`);
}

// A local Instance signs its notifications with the key pair under "push"
// in settings.json, {"publicKey": "…", "privateKey": "…"}, and sends none
// without it. The hosted Instance keeps its pair as Worker secrets instead.
export function pushKeys(): PushKeys {
	const push = settingsFile()?.push;
	if (push === undefined) return {kind: 'none'};
	const given = (value: unknown) => typeof value === 'string' && value !== '';
	if (given(push?.publicKey) && given(push?.privateKey)) return {kind: 'set', publicKey: push.publicKey, privateKey: push.privateKey};
	throw new Error(`"push" in ${settingsPath()} must have a publicKey and a privateKey.`);
}

const hosted = () => {
	const found = settings();
	return found.instance === 'hosted' ? found : null;
};

export const apiUrl = (): string => process.env.TODOS_API_URL ?? hosted()?.url ?? `http://127.0.0.1:${apiPort()}`;

// The service token goes only to the address it was made for, never to an
// address that TODOS_API_URL points somewhere else.
export function apiHeaders(): Record<string, string> {
	const access = hosted();
	if (!access || access.url !== apiUrl()) return {};
	return {'CF-Access-Client-Id': access.clientId, 'CF-Access-Client-Secret': access.clientSecret};
}

// The tmux server todos runs on, kept apart from any normal tmux setup.
export const tmuxSocket = (): string => process.env.TODOS_TMUX_SOCKET ?? 'todos';
