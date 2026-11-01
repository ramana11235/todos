// The only way the TUI, the MCP server and the hooks reach todos. They know
// an address and nothing about what stores the data behind it.

import type {BatchRequest, BatchResult, Changes} from '../api/api.js';
import type {Area, Belongs, Project} from '../core/project.js';
import type {AreaEdit, NewProject, ProjectEdit} from '../core/projects.js';
import type {Task} from '../core/task.js';
import type {NewTask, TaskEdit} from '../core/tasks.js';
import type {Page, SaveResult} from '../core/thoughts.js';
import type {Prompt, SessionSignal, Thread} from '../core/thread.js';
import type {MyEdit, SessionUpdate, SessionUpdateResult, SessionView} from '../core/threads.js';

// The change number a client last saw, if any.
export type Seen = {kind: 'nothing'} | {kind: 'number'; number: number};

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export type ApiHealth = {build?: string | null; home?: string | null; pid?: number};

export class Client {
	// `headers` go with every request, such as the hosted Instance's Access
	// service token. A request that gets no answer within `timeoutMs` fails, so
	// a Session never stalls on a todos that cannot be reached.
	constructor(
		private readonly baseUrl: string,
		private readonly headers: Record<string, string> = {},
		private readonly timeoutMs = 2000,
	) {}

	async isUp(): Promise<boolean> {
		return (await this.health()) !== null;
	}

	// null when nothing answers. An API from before builds were tracked
	// answers without a build or pid.
	async health(): Promise<ApiHealth | null> {
		try {
			return await this.call('GET', '/api/health');
		} catch {
			return null;
		}
	}

	threads = (): Promise<Thread[]> => this.call('GET', '/api/threads');

	thread = (id: string): Promise<Thread> => this.call('GET', `/api/threads/${id}`);

	create = (
		title: string,
		parentId: string | null = null,
		afterId: string | null = null,
		fields: {notes?: string; summary?: string; nextStep?: string; belongs?: Belongs} = {},
	): Promise<Thread> => this.call('POST', '/api/threads', {title, parentId, afterId, ...fields});

	edit = (id: string, edit: MyEdit): Promise<Thread> => this.call('PATCH', `/api/threads/${id}`, edit);

	move = (id: string, parentId: string | null, index?: number): Promise<Thread> =>
		this.call('POST', `/api/threads/${id}/move`, {parentId, index});

	reorder = (id: string, direction: 'up' | 'down'): Promise<void> =>
		this.call('POST', `/api/threads/${id}/reorder`, {direction});

	recordSession = (id: string, session: {claudeSessionId?: string | null; sessionPane?: string | null}): Promise<Thread> =>
		this.call('POST', `/api/threads/${id}/session`, session);

	signal = (id: string, signal: SessionSignal | null): Promise<void> =>
		this.call('POST', `/api/threads/${id}/signal`, {signal});

	sessionView = (id: string): Promise<SessionView> => this.call('GET', `/api/threads/${id}/session-view`);

	sessionUpdate = (id: string, update: SessionUpdate): Promise<SessionUpdateResult> =>
		this.call('POST', `/api/threads/${id}/session-update`, update);

	prompts = (): Promise<Prompt[]> => this.call('GET', '/api/prompts');

	sendPrompt = (id: string, text: string | null): Promise<Prompt> => this.call('POST', `/api/threads/${id}/prompts`, {text});

	promptDelivered = (id: string): Promise<void> => this.call('DELETE', `/api/prompts/${id}`);

	// Asks whether anything changed since the number last seen, and gets the
	// Threads and the open Tasks back only when something did.
	changes = (seen: Seen): Promise<Changes> => this.call('GET', `/api/changes/${seen.kind === 'number' ? seen.number : 'none'}`);

	tasks = (): Promise<Task[]> => this.call('GET', '/api/tasks');

	task = (id: string): Promise<Task> => this.call('GET', `/api/tasks/${id}`);

	logbook = (): Promise<Task[]> => this.call('GET', '/api/logbook');

	addTask = (task: NewTask): Promise<Task> => this.call('POST', '/api/tasks', task);

	editTask = (id: string, edit: TaskEdit): Promise<Task> => this.call('PATCH', `/api/tasks/${id}`, edit);

	turnIntoThread = (id: string, parentId: string | null): Promise<Thread> => this.call('POST', `/api/tasks/${id}/thread`, {parentId});

	reorderTask = (id: string, direction: 'up' | 'down'): Promise<void> =>
		this.call('POST', `/api/tasks/${id}/reorder`, {direction});

	areas = (): Promise<Area[]> => this.call('GET', '/api/areas');

	createArea = (area: {title: string; notes?: string}): Promise<Area> => this.call('POST', '/api/areas', area);

	editArea = (id: string, edit: AreaEdit): Promise<Area> => this.call('PATCH', `/api/areas/${id}`, edit);

	projects = (): Promise<Project[]> => this.call('GET', '/api/projects');

	createProject = (project: NewProject): Promise<Project> => this.call('POST', '/api/projects', project);

	editProject = (id: string, edit: ProjectEdit): Promise<Project> => this.call('PATCH', `/api/projects/${id}`, edit);

	batch = (requests: BatchRequest[]): Promise<{results: BatchResult[]}> => this.call('POST', '/api/batch', {requests});

	// Sends one change written as a batch writes it, so the MCP tools build
	// each request in one place whether it goes alone or in a batch.
	send = <T>({method, path, body}: BatchRequest): Promise<T> => this.call(method, path, body);

	thoughts = (): Promise<Page> => this.call('GET', '/api/thoughts');

	saveThoughts = (text: string, version: number): Promise<SaveResult> =>
		this.call('PUT', '/api/thoughts', {text, version});

	private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
		const response = await fetch(this.baseUrl + path, {
			method,
			// The API takes changes only in JSON, even with no body, so every
			// request that is not a GET says so.
			headers: method === 'GET' ? this.headers : {...this.headers, 'content-type': 'application/json'},
			body: body === undefined ? undefined : JSON.stringify(body),
			// Access answers a request it does not let in with a redirect to its
			// sign-in page, which is an error here, not a page to follow.
			redirect: 'manual',
			signal: AbortSignal.timeout(this.timeoutMs),
		});
		// Only the API answers in JSON; anything else, such as an Access page,
		// is reported by its status.
		const result = response.headers.get('content-type')?.includes('application/json') ? ((await response.json()) as any) : undefined;
		if (!response.ok || result === undefined) {
			throw new ApiError(response.status, result?.error ?? `${response.status} ${response.statusText} from ${this.baseUrl}${path}`);
		}
		return result as T;
	}
}
