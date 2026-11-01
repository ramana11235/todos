import type {Area, Belongs, InArea, Project} from '../core/project.js';
import type {Place, Task, TaskWhen} from '../core/task.js';
import type {Page} from '../core/thoughts.js';
import type {Deadline, Ended, Prompt, SessionSignal, Thread, When, WhoseMove} from '../core/thread.js';
import type {Storage} from './storage.js';

// The few calls the SQL below needs, so the same SQL runs on the local
// SQLite file and on D1.
export interface Database {
	all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
	get<T>(sql: string, ...params: unknown[]): Promise<T | undefined>;
	// Returns how many rows changed.
	run(sql: string, ...params: unknown[]): Promise<number>;
}

// Threads and Tasks kept in SQL. The schema is in the migrations folder,
// which both the local SQLite file and D1 apply.
export abstract class SqlStorage implements Storage {
	constructor(protected readonly db: Database) {}

	async listThreads(): Promise<Thread[]> {
		const rows = await this.db.all<Row>('SELECT * FROM threads');
		return rows.map(fromRow);
	}

	async getThread(id: string): Promise<Thread | undefined> {
		const row = await this.db.get<Row>('SELECT * FROM threads WHERE id = ?', id);
		return row ? fromRow(row) : undefined;
	}

	async saveThread(thread: Thread): Promise<void> {
		await this.db.run(
			`INSERT INTO threads (id, title, summary, next_step, notes, whose_move, when_kind, when_day, ended, deadline,
					parent_id, belongs_kind, belongs_id, position, directory, claude_session_id, session_pane, session_signal,
					my_edit_at, session_seen_at, summary_updated_at, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					title = excluded.title, summary = excluded.summary, next_step = excluded.next_step,
					notes = excluded.notes, whose_move = excluded.whose_move, when_kind = excluded.when_kind,
					when_day = excluded.when_day, ended = excluded.ended, deadline = excluded.deadline,
					parent_id = excluded.parent_id, belongs_kind = excluded.belongs_kind, belongs_id = excluded.belongs_id,
					position = excluded.position, directory = excluded.directory,
					claude_session_id = excluded.claude_session_id, session_pane = excluded.session_pane,
					session_signal = excluded.session_signal,
					my_edit_at = excluded.my_edit_at, session_seen_at = excluded.session_seen_at,
					summary_updated_at = excluded.summary_updated_at`,
			thread.id,
			thread.title,
			thread.summary,
			thread.nextStep,
			thread.notes,
			...Object.values(columnsOf({whoseMove: thread.whoseMove, when: thread.when, ended: thread.ended, deadline: thread.deadline}, threadColumns)),
			thread.parentId,
			...belongsColumns(thread.belongs),
			thread.position,
			thread.directory,
			thread.claudeSessionId,
			thread.sessionPane,
			thread.sessionSignal,
			thread.myEditAt,
			thread.sessionSeenAt,
			thread.summaryUpdatedAt,
			thread.createdAt,
		);
	}

	updateThread(id: string, changes: Partial<Thread>): Promise<void> {
		return this.update('threads', id, columnsOf(changes, threadColumns));
	}

	updateTask(id: string, changes: Partial<Task>): Promise<void> {
		return this.update('tasks', id, columnsOf(changes, taskColumns));
	}

	updateArea(id: string, changes: Partial<Area>): Promise<void> {
		return this.update('areas', id, columnsOf(changes, areaColumns));
	}

	updateProject(id: string, changes: Partial<Project>): Promise<void> {
		return this.update('projects', id, columnsOf(changes, projectColumns));
	}

	// Writes only the given columns of one row, leaving the rest as they are.
	private async update(table: string, id: string, columns: Record<string, unknown>): Promise<void> {
		const {id: _, ...rest} = columns;
		const entries = Object.entries(rest);
		if (entries.length === 0) return;
		await this.db.run(`UPDATE ${table} SET ${entries.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`, ...entries.map(([, value]) => value), id);
	}

	async listTasks(): Promise<Task[]> {
		return (await this.db.all<TaskRow>('SELECT * FROM tasks')).map(taskFromRow);
	}

	async getTask(id: string): Promise<Task | undefined> {
		const row = await this.db.get<TaskRow>('SELECT * FROM tasks WHERE id = ?', id);
		return row ? taskFromRow(row) : undefined;
	}

	async saveTask(task: Task): Promise<void> {
		await this.db.run(
			`INSERT INTO tasks (id, title, when_kind, when_day, thread_id, belongs_kind, belongs_id, position, deadline, notes, checklist, ended, ended_at, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					title = excluded.title, when_kind = excluded.when_kind, when_day = excluded.when_day,
					thread_id = excluded.thread_id, belongs_kind = excluded.belongs_kind, belongs_id = excluded.belongs_id, position = excluded.position, deadline = excluded.deadline,
					notes = excluded.notes, checklist = excluded.checklist, ended = excluded.ended,
					ended_at = excluded.ended_at`,
			task.id,
			task.title,
			task.when.kind,
			task.when.kind === 'on_day' ? task.when.day : null,
			task.threadId,
			...belongsColumns(task.belongs),
			task.position,
			dayOfDeadline(task.deadline),
			task.notes,
			JSON.stringify(task.checklist),
			task.ended,
			task.endedAt,
			task.createdAt,
		);
	}

	async renumberTasks(ids: string[]): Promise<void> {
		const list = JSON.stringify(ids);
		await this.db.run('UPDATE tasks SET position = (SELECT key FROM json_each(?) WHERE value = tasks.id) WHERE id IN (SELECT value FROM json_each(?))', list, list);
	}

	async listPrompts(): Promise<Prompt[]> {
		const rows = await this.db.all<{id: string; thread_id: string; text: string | null; created_at: string}>('SELECT * FROM prompts ORDER BY created_at, rowid');
		return rows.map(row => ({id: row.id, threadId: row.thread_id, text: row.text, createdAt: row.created_at}));
	}

	async savePrompt(prompt: Prompt): Promise<void> {
		await this.db.run('INSERT INTO prompts (id, thread_id, text, created_at) VALUES (?, ?, ?, ?)', prompt.id, prompt.threadId, prompt.text, prompt.createdAt);
	}

	async deleteTask(id: string): Promise<void> {
		await this.db.run('DELETE FROM tasks WHERE id = ?', id);
	}

	async deletePrompt(id: string): Promise<void> {
		await this.db.run('DELETE FROM prompts WHERE id = ?', id);
	}

	async listAreas(): Promise<Area[]> {
		const rows = await this.db.all<{id: string; title: string; notes: string; ended: string; position: number; created_at: string}>('SELECT * FROM areas');
		return rows.map(row => ({id: row.id, title: row.title, notes: row.notes, ended: row.ended as Area['ended'], position: row.position, createdAt: row.created_at}));
	}

	async saveArea(area: Area): Promise<void> {
		await this.db.run(
			`INSERT INTO areas (id, title, notes, ended, position, created_at) VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET title = excluded.title, notes = excluded.notes, ended = excluded.ended, position = excluded.position`,
			area.id,
			area.title,
			area.notes,
			area.ended,
			area.position,
			area.createdAt,
		);
	}

	async listProjects(): Promise<Project[]> {
		const rows = await this.db.all<{id: string; title: string; notes: string; area_id: string | null; deadline: string | null; ended: string; position: number; created_at: string}>('SELECT * FROM projects');
		return rows.map(row => ({
			id: row.id,
			title: row.title,
			notes: row.notes,
			area: (row.area_id ? {kind: 'in', id: row.area_id} : {kind: 'none'}) as InArea,
			deadline: deadlineOf(row.deadline),
			ended: row.ended as Ended,
			position: row.position,
			createdAt: row.created_at,
		}));
	}

	async saveProject(project: Project): Promise<void> {
		await this.db.run(
			`INSERT INTO projects (id, title, notes, area_id, deadline, ended, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET title = excluded.title, notes = excluded.notes, area_id = excluded.area_id,
					deadline = excluded.deadline, ended = excluded.ended, position = excluded.position`,
			project.id,
			project.title,
			project.notes,
			project.area.kind === 'in' ? project.area.id : null,
			dayOfDeadline(project.deadline),
			project.ended,
			project.position,
			project.createdAt,
		);
	}

	async changeNumber(): Promise<number> {
		return (await this.db.get<{number: number}>('SELECT number FROM changes'))!.number;
	}

	async getThoughts(): Promise<Page> {
		return {...(await this.db.get<Page>('SELECT text, version FROM thoughts'))!};
	}

	async saveThoughts(text: string, version: number): Promise<boolean> {
		return (await this.db.run('UPDATE thoughts SET text = ?, version = version + 1 WHERE version = ?', text, version)) === 1;
	}

	abstract close(): void;
}

// The columns that hold the given fields. When and the Deadline each carry a
// day only in some cases, and the day sits in a column of its own that is
// empty otherwise. The fields shaped like that are the same on every table;
// the rest are named in `names`.
function columnsOf(changes: object, names: Record<string, string>): Record<string, unknown> {
	const columns: Record<string, unknown> = {};
	for (const [field, value] of Object.entries(changes) as [string, any][]) {
		if (field === 'when') Object.assign(columns, {when_kind: value.kind, when_day: value.kind === 'on_day' ? value.day : null});
		else if (field === 'deadline') columns.deadline = dayOfDeadline(value);
		else if (field === 'belongs') Object.assign(columns, belongsColumnsOf(value));
		else if (field === 'area') columns.area_id = value.kind === 'in' ? value.id : null;
		else if (field === 'checklist') columns.checklist = JSON.stringify(value);
		else if (names[field]) columns[names[field]] = value;
		else throw new Error(`No column for ${field}`);
	}
	return columns;
}

const taskColumns: Record<Exclude<keyof Task, 'when' | 'deadline' | 'belongs' | 'checklist'>, string> = {
	id: 'id',
	title: 'title',
	threadId: 'thread_id',
	position: 'position',
	notes: 'notes',
	ended: 'ended',
	endedAt: 'ended_at',
	createdAt: 'created_at',
};

const areaColumns: Record<keyof Area, string> = {id: 'id', title: 'title', notes: 'notes', ended: 'ended', position: 'position', createdAt: 'created_at'};

const projectColumns: Record<Exclude<keyof Project, 'area' | 'deadline'>, string> = {
	id: 'id',
	title: 'title',
	notes: 'notes',
	ended: 'ended',
	position: 'position',
	createdAt: 'created_at',
};

// What a Thread or Task belongs to sits in two columns, the id empty for none.
const belongsColumnsOf = (belongs: Belongs) => ({belongs_kind: belongs.kind, belongs_id: belongs.kind === 'none' ? null : belongs.id});
const belongsColumns = (belongs: Belongs) => Object.values(belongsColumnsOf(belongs));
const belongsOf = (kind: string, id: string | null): Belongs => (kind === 'none' ? {kind: 'none'} : ({kind, id: id!} as Belongs));

const dayOfDeadline = (deadline: Deadline) => (deadline.kind === 'by_day' ? deadline.day : null);
const deadlineOf = (day: string | null): Deadline => (day ? {kind: 'by_day', day} : {kind: 'none'});

const threadColumns: Record<Exclude<keyof Thread, 'when' | 'deadline' | 'belongs'>, string> = {
	id: 'id',
	title: 'title',
	summary: 'summary',
	nextStep: 'next_step',
	notes: 'notes',
	whoseMove: 'whose_move',
	ended: 'ended',
	parentId: 'parent_id',
	position: 'position',
	directory: 'directory',
	claudeSessionId: 'claude_session_id',
	sessionPane: 'session_pane',
	sessionSignal: 'session_signal',
	myEditAt: 'my_edit_at',
	sessionSeenAt: 'session_seen_at',
	summaryUpdatedAt: 'summary_updated_at',
	createdAt: 'created_at',
};

type Row = {
	id: string;
	title: string;
	summary: string;
	next_step: string;
	notes: string;
	whose_move: string;
	when_kind: string;
	when_day: string | null;
	ended: string;
	deadline: string | null;
	parent_id: string | null;
	belongs_kind: string;
	belongs_id: string | null;
	position: number;
	directory: string | null;
	claude_session_id: string | null;
	session_pane: string | null;
	session_signal: string | null;
	my_edit_at: string | null;
	session_seen_at: string | null;
	summary_updated_at: string | null;
	created_at: string;
};

function fromRow(row: Row): Thread {
	return {
		id: row.id,
		title: row.title,
		summary: row.summary,
		nextStep: row.next_step,
		notes: row.notes,
		whoseMove: row.whose_move as WhoseMove,
		when: row.when_kind === 'on_day' ? {kind: 'on_day', day: row.when_day!} : ({kind: row.when_kind} as When),
		ended: row.ended as Ended,
		deadline: deadlineOf(row.deadline),
		parentId: row.parent_id,
		belongs: belongsOf(row.belongs_kind, row.belongs_id),
		position: row.position,
		directory: row.directory,
		claudeSessionId: row.claude_session_id,
		sessionPane: row.session_pane,
		sessionSignal: row.session_signal as SessionSignal | null,
		myEditAt: row.my_edit_at,
		sessionSeenAt: row.session_seen_at,
		summaryUpdatedAt: row.summary_updated_at,
		createdAt: row.created_at,
	};
}

type TaskRow = {
	id: string;
	title: string;
	when_kind: string;
	when_day: string | null;
	thread_id: string | null;
	belongs_kind: string;
	belongs_id: string | null;
	position: number;
	deadline: string | null;
	notes: string;
	checklist: string;
	ended: string;
	ended_at: string | null;
	created_at: string;
};

function taskFromRow(row: TaskRow): Task {
	return {
		id: row.id,
		title: row.title,
		when: row.when_kind === 'on_day' ? {kind: 'on_day', day: row.when_day!} : ({kind: row.when_kind as Place} as TaskWhen),
		threadId: row.thread_id,
		belongs: belongsOf(row.belongs_kind, row.belongs_id),
		position: row.position,
		deadline: deadlineOf(row.deadline),
		notes: row.notes,
		checklist: JSON.parse(row.checklist),
		ended: row.ended as Ended,
		endedAt: row.ended_at,
		createdAt: row.created_at,
	};
}
