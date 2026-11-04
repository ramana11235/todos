// The API on a laptop: the routes from api.ts behind Node's HTTP server, which
// also serves the built web app at every path outside /api.

import {readFile} from 'node:fs/promises';
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import {extname, join, normalize} from 'node:path';
import type {Projects} from '../core/projects.js';
import type {InstanceSettings} from '../core/settings.js';
import type {Tasks} from '../core/tasks.js';
import type {Thoughts} from '../core/thoughts.js';
import type {Threads} from '../core/threads.js';
import {createHandler} from './api.js';

// `build` says which build of todos is serving, so the launcher can tell when
// a running API is out of date, `home` which Instance it serves, and `web` the
// folder of the built web app.
export function createApi(
	threads: Threads,
	tasks: Tasks,
	thoughts: Thoughts,
	projects: Projects,
	settings: InstanceSettings,
	{build = null, home = null, web = null}: {build?: string | null; home?: string | null; web?: string | null} = {},
): Server {
	const handle = createHandler(threads, tasks, thoughts, projects, settings, {build, home, pid: process.pid});
	const server = createServer(async (request, response) => {
		// Only a request sent to the laptop itself is answered. A web page can
		// make its own name point at 127.0.0.1 and then reach this API as if
		// it were its own site, but its requests still carry that name.
		const port = (server.address() as AddressInfo).port;
		if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host ?? '')) {
			response.writeHead(403, {'content-type': 'application/json'});
			response.end(JSON.stringify({error: 'The local API only answers requests sent to 127.0.0.1 or localhost'}));
			return;
		}
		const path = new URL(request.url ?? '/', 'http://localhost').pathname;
		if (web && request.method === 'GET' && !path.startsWith('/api/')) return serveFile(response, web, path);
		const answer = await handle(await toRequest(request));
		response.writeHead(answer.status, Object.fromEntries(answer.headers));
		response.end(Buffer.from(await answer.arrayBuffer()));
	});
	return server;
}

async function toRequest(request: IncomingMessage): Promise<Request> {
	let body = '';
	for await (const chunk of request) body += chunk;
	const method = request.method ?? 'GET';
	return new Request(new URL(request.url ?? '/', 'http://localhost'), {
		method,
		headers: Object.entries(request.headers).flatMap(([name, value]) =>
			value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(one => [name, one] as [string, string]),
		),
		body: method === 'GET' || method === 'HEAD' ? undefined : body,
	});
}

const types: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.webmanifest': 'application/manifest+json',
	'.json': 'application/json',
};

// Any path that is not a file is the page itself, which works out what to
// show. Paths are kept inside the folder.
async function serveFile(response: ServerResponse, web: string, path: string): Promise<void> {
	let decoded;
	try {
		decoded = decodeURIComponent(path);
	} catch {
		response.writeHead(400, {'content-type': 'application/json'});
		response.end(JSON.stringify({error: 'The address is not valid'}));
		return;
	}
	const file = normalize(join(web, decoded));
	for (const candidate of file.startsWith(join(web, '/')) ? [file, join(web, 'index.html')] : [join(web, 'index.html')]) {
		try {
			const body = await readFile(candidate);
			response.writeHead(200, {'content-type': types[extname(candidate)] ?? 'application/octet-stream'});
			response.end(body);
			return;
		} catch {
			// Not a file, so try the page.
		}
	}
	response.writeHead(404, {'content-type': 'application/json'});
	response.end(JSON.stringify({error: 'The web app is not built. Run npm run build.'}));
}
