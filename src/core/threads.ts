// Everything that changes Threads goes through here, so the rules in
// CONTEXT.md hold whichever client asks.

import {randomUUID} from 'node:crypto';
import type {Storage} from '../storage/storage.js';
import {sameBelongs, threadBelongs, type Belongs} from './project.js';
import {requireBelongs} from './projects.js';
import {isDay} from './task.js';
import {
	childrenOf,
	isBelow,
	type Deadline,
	type Ended,
	type Prompt,
	type SessionSignal,
	type Thread,
	type When,
	type WhoseMove,
} from './thread.js';

export class ThreadError extends Error {
	constructor(
		readonly code: 'not_found' | 'invalid',
		message: string,
	) {
		super(message);
	}
}

// Changes one passage of the Notes: `old` must appear exactly once.
export type NoteEdit = {old: string; new: string};

export type MyEdit = {
	title?: string;
	summary?: string;
	nextStep?: string;
	notes?: string;
	noteEdits?: NoteEdit[];
	whoseMove?: WhoseMove;
	when?: When;
	ended?: Ended;
	deadline?: Deadline;
	// Only a Thread at the top of its tree takes this.
	belongs?: Belongs;
	directory?: string | null;
};

// A Session's change to its own Thread, touching only what it names. It
// changes When or Ended only when I tell it to.
export type SessionUpdate = MyEdit;

export type SessionView = {
	thread: Thread;
	// True when I edited the Thread after the Session last read or wrote it,
	// so the Session should keep my changes.
	editedByMeSinceYourLastUpdate: boolean;
};

// An update is refused when I edited the Thread since the Session last saw
// it. The Session is then shown my version, so its next update can keep my
// changes, without having to read the Thread before every update.
export type SessionUpdateResult = {updated: true; thread: Thread} | {updated: false; thread: Thread};

export class Threads {
	constructor(
		private readonly storage: Storage,
		private readonly now: () => Date = () => new Date(),
	) {}

	list(): Promise<Thread[]> {
		return this.storage.listThreads();
	}

	changeNumber(): Promise<number> {
		return this.storage.changeNumber();
	}

	async get(id: string): Promise<Thread> {
		const thread = await this.storage.getThread(id);
		if (!thread) throw new ThreadError('not_found', `No Thread ${id}`);
		return thread;
	}

	// A new Thread goes last among its siblings, straight after afterId, or at
	// index among them, 0 for first.
	async create({
		title,
		parentId = null,
		afterId = null,
		index,
		notes,
		summary,
		nextStep,
		when,
		deadline,
		belongs,
	}: {title: string; parentId?: string | null; afterId?: string | null; index?: number; notes?: string; summary?: string; nextStep?: string; when?: When; deadline?: Deadline; belongs?: Belongs}): Promise<Thread> {
		const threads = await this.list();
		if (parentId) await this.get(parentId);
		const siblings = childrenOf(threads, parentId);
		const after = afterId ? siblings.find(sibling => sibling.id === afterId) : undefined;
		if (afterId && !after) throw new ThreadError('invalid', `Thread ${afterId} is not a sibling of the new Thread`);
		const thread: Thread = {
			id: randomUUID(),
			title: requireTitle(title),
			summary: '',
			nextStep: '',
			notes: '',
			whoseMove: 'on_me',
			when: {kind: 'active'},
			ended: 'not_ended',
			deadline: {kind: 'none'},
			parentId,
			belongs: {kind: 'none'},
			position: after ? after.position + 1 : siblings.length === 0 ? 0 : Math.max(...siblings.map(s => s.position)) + 1,
			directory: null,
			claudeSessionId: null,
			sessionPane: null,
			sessionSignal: null,
			myEditAt: null,
			sessionSeenAt: null,
			summaryUpdatedAt: null,
			createdAt: this.stamp(),
		};
		// Checked before anything is saved, so a refused Thread is not made.
		facts({when, deadline});
		await this.belonging(thread, {belongs});
		for (const sibling of siblings) {
			if (after && sibling.position > after.position) await this.save(sibling, {...sibling, position: sibling.position + 1});
		}
		await this.storage.saveThread(thread);
		if (index !== undefined) Object.assign(thread, await this.move(thread.id, parentId, index));
		// Written as my edit, as if I had filled them in straight after creating it.
		if ([notes, summary, nextStep, when, deadline, belongs].some(given => given !== undefined)) return this.edit(thread.id, {notes, summary, nextStep, when, deadline, belongs});
		return thread;
	}

	async edit(id: string, edit: MyEdit): Promise<Thread> {
		refuseOldFields(edit, ['state']);
		const thread = await this.get(id);
		const next: Thread = {...thread, myEditAt: this.stamp()};
		if (edit.title !== undefined) next.title = requireTitle(edit.title);
		if (edit.summary !== undefined) next.summary = edit.summary.trim();
		if (edit.nextStep !== undefined) next.nextStep = edit.nextStep.trim();
		next.notes = changedNotes(thread.notes, edit);
		if (edit.directory !== undefined) next.directory = edit.directory?.trim() || null;
		Object.assign(next, facts(edit), await this.belonging(thread, edit));
		this.noteSummaryChange(thread, next);
		await this.save(thread, next);
		return next;
	}

	// Without an index the Thread goes last, and stays put if its parent is
	// unchanged. Under a parent it belongs where its new tree does, and taken
	// to the top level it keeps what it belonged to through its old tree.
	async move(id: string, parentId: string | null, index?: number): Promise<Thread> {
		const threads = await this.list();
		const thread = await this.get(id);
		if (parentId !== null) {
			await this.get(parentId);
			if (parentId === id || isBelow(threads, parentId, id)) {
				throw new ThreadError('invalid', 'A Thread cannot move under itself');
			}
		}
		if (thread.parentId === parentId && index === undefined) return thread;
		const moved: Thread = {...thread, parentId, belongs: parentId === null ? threadBelongs(thread, threads) : {kind: 'none'}};
		const order = childrenOf(threads, parentId).filter(sibling => sibling.id !== id);
		order.splice(Math.max(0, Math.min(index ?? order.length, order.length)), 0, moved);
		for (const [position, sibling] of order.entries()) {
			if (sibling === moved || sibling.position !== position) await this.save(sibling === moved ? thread : sibling, {...sibling, position});
		}
		return {...moved, position: order.indexOf(moved)};
	}

	async reorder(id: string, direction: 'up' | 'down'): Promise<void> {
		const threads = await this.list();
		const thread = await this.get(id);
		// At the top level, Home shows the Threads of each project or area
		// together, so a Thread moves past the next one in the same place.
		const siblings = childrenOf(threads, thread.parentId).filter(sibling => thread.parentId || sameBelongs(sibling.belongs, thread.belongs));
		const index = siblings.findIndex(sibling => sibling.id === id);
		const other = siblings[direction === 'up' ? index - 1 : index + 1];
		if (!other) return;
		// The two swap places and every sibling is renumbered, which also works
		// when the two share a position, where swapping positions would not.
		const order = childrenOf(threads, thread.parentId);
		const [from, to] = [order.indexOf(siblings[index]!), order.indexOf(other)];
		[order[from], order[to]] = [other, siblings[index]!];
		for (const [position, sibling] of order.entries()) {
			if (sibling.position !== position) await this.save(sibling, {...sibling, position});
		}
	}

	async recordSession(
		id: string,
		session: {claudeSessionId?: string | null; sessionPane?: string | null},
	): Promise<Thread> {
		const thread = await this.get(id);
		const next = {...thread};
		if (session.claudeSessionId !== undefined) next.claudeSessionId = session.claudeSessionId;
		if (session.sessionPane !== undefined) next.sessionPane = session.sessionPane;
		await this.save(thread, next);
		return next;
	}

	// null means the Session has gone, so the Thread keeps its last state.
	async signal(id: string, signal: SessionSignal | null): Promise<void> {
		const thread = await this.get(id);
		await this.save(thread, {...thread, sessionSignal: signal});
	}

	async sessionUpdate(id: string, update: SessionUpdate): Promise<SessionUpdateResult> {
		refuseOldFields(update, ['state']);
		const thread = await this.get(id);
		if (editedSince(thread)) {
			const seen = {...thread, sessionSeenAt: this.seenStamp(thread)};
			await this.save(thread, seen);
			return {updated: false, thread: seen};
		}
		const next: Thread = {...thread, sessionSeenAt: this.stamp()};
		if (update.title !== undefined) next.title = requireTitle(update.title);
		if (update.summary !== undefined) next.summary = update.summary.trim();
		if (update.nextStep !== undefined) next.nextStep = update.nextStep.trim();
		next.notes = changedNotes(thread.notes, update);
		if (update.directory !== undefined) next.directory = update.directory?.trim() || null;
		Object.assign(next, facts(update), await this.belonging(thread, update));
		this.noteSummaryChange(thread, next);
		await this.save(thread, next);
		return {updated: true, thread: next};
	}

	async sessionView(id: string): Promise<SessionView> {
		const thread = await this.get(id);
		await this.save(thread, {...thread, sessionSeenAt: this.seenStamp(thread)});
		return {thread, editedByMeSinceYourLastUpdate: editedSince(thread)};
	}


	// A prompt is kept until the laptop running Home delivers it, so it can
	// be sent from anywhere (docs/adr/0003). null text only starts the Session.
	async sendPrompt(threadId: string, text: string | null): Promise<Prompt> {
		await this.get(threadId);
		if (text !== null && (typeof text !== 'string' || !text.trim())) throw new ThreadError('invalid', 'A prompt needs some text');
		if (text !== null && controlCharacters.test(text)) throw new ThreadError('invalid', 'A prompt can only hold text, new lines and tabs');
		const prompt: Prompt = {id: randomUUID(), threadId, text: text?.trim() ?? null, createdAt: this.stamp()};
		await this.storage.savePrompt(prompt);
		return prompt;
	}

	prompts(): Promise<Prompt[]> {
		return this.storage.listPrompts();
	}

	promptDelivered(id: string): Promise<void> {
		return this.storage.deletePrompt(id);
	}

	// A Thread under another belongs where the top of its tree does, so it
	// cannot be given anything of its own.
	private async belonging(thread: Thread, edit: MyEdit): Promise<Partial<Thread>> {
		if (edit.belongs === undefined) return {};
		const belongs = await requireBelongs(this.storage, edit.belongs);
		if (thread.parentId !== null && belongs.kind !== 'none') throw new ThreadError('invalid', 'Only a Thread at the top of its tree belongs to a project or area; the Threads under it belong where it does');
		return {belongs};
	}

	// Writes only what changed from `before`, so a hook and a Session saving
	// the same Thread at the same moment do not undo each other's changes.
	private save(before: Thread, after: Thread): Promise<void> {
		return this.storage.updateThread(before.id, changedFields(before, after));
	}

	private noteSummaryChange(before: Thread, after: Thread): void {
		if (before.summary !== after.summary || before.nextStep !== after.nextStep) after.summaryUpdatedAt = this.stamp();
	}

	// The Session has now seen my edit, so the stamp must come after it,
	// even when both fall in the same millisecond.
	private seenStamp(thread: Thread): string {
		const now = this.now().getTime();
		const edit = thread.myEditAt ? Date.parse(thread.myEditAt) + 1 : 0;
		return new Date(Math.max(now, edit)).toISOString();
	}

	private stamp(): string {
		return this.now().toISOString();
	}

}

// The fields of `after` that differ from `before`. Saving only these lets
// two changes to different fields of one row made at the same moment both
// land, where writing the whole row back would undo the other change.
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
	return Object.fromEntries(Object.entries(after).filter(([field, value]) => before[field as keyof T] !== value)) as Partial<T>;
}

// Fields that only clients older than whose move, When and Ended send. They
// are refused rather than ignored, so a change is never dropped without a word.
export function refuseOldFields(body: object, fields: string[]): void {
	const old = fields.filter(field => field in body);
	if (old.length) throw new ThreadError('invalid', `todos no longer takes ${old.join(', ')}. Restart the Session or reload the page to use the new todos.`);
}

// Whose move, When, Ended and the Deadline from an edit, each checked, since
// they come from outside.
function facts(edit: MyEdit): Partial<Thread> {
	const found: Partial<Thread> = {};
	if (edit.whoseMove !== undefined) found.whoseMove = oneOf<WhoseMove>(edit.whoseMove, ['on_me', 'waiting'], 'Whose move');
	if (edit.ended !== undefined) found.ended = requireEnded(edit.ended);
	if (edit.when !== undefined) found.when = requireWhen(edit.when);
	if (edit.deadline !== undefined) found.deadline = requireDeadline(edit.deadline);
	return found;
}

// A Thread and a project take When in the same shape.
export function requireWhen(value: unknown): When {
	const when = value as {kind?: unknown; day?: unknown} | null;
	if (when?.kind === 'active' || when?.kind === 'someday') return {kind: when.kind};
	if (when?.kind === 'on_day' && isDay(when.day)) return {kind: 'on_day', day: when.day};
	throw new ThreadError('invalid', 'When is {kind: "active"}, {kind: "someday"} or {kind: "on_day", day: "2026-10-23"}');
}

// A Thread and a Task take Ended and a Deadline in the same shapes.
export const requireEnded = (ended: unknown): Ended => oneOf<Ended>(ended, ['not_ended', 'done', 'dropped'], 'Ended');

export function requireDeadline(value: unknown): Deadline {
	const deadline = value as {kind?: unknown; day?: unknown} | null;
	if (deadline?.kind === 'none') return {kind: 'none'};
	if (deadline?.kind === 'by_day' && isDay(deadline.day)) return {kind: 'by_day', day: deadline.day};
	throw new ThreadError('invalid', 'A Deadline is {kind: "none"} or {kind: "by_day", day: "2026-10-23"}');
}

function oneOf<T extends string>(value: unknown, allowed: T[], name: string): T {
	if (allowed.includes(value as T)) return value as T;
	throw new ThreadError('invalid', `${name} is one of ${allowed.join(', ')}`);
}

// A prompt is pasted into a Session as text. A control character, such as
// the escape that ends a paste, would let the rest of it press keys instead,
// such as Shift+Tab, which changes what the Session may do without asking.
// Only new lines and tabs are text.
export const controlCharacters = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;

function requireTitle(title: string): string {
	const trimmed = title.trim();
	if (!trimmed) throw new ThreadError('invalid', 'A Thread needs a title');
	return trimmed;
}

// Whole Notes replace the old ones before any edits apply. An edit whose old
// text is missing or not unique saves nothing, as with the Edit tool.
function changedNotes(notes: string, {notes: whole, noteEdits = []}: {notes?: string; noteEdits?: NoteEdit[]}): string {
	let changed = whole ?? notes;
	for (const edit of noteEdits) {
		const at = edit.old ? changed.indexOf(edit.old) : -1;
		if (at < 0) throw new ThreadError('invalid', `The notes do not contain: ${edit.old}`);
		if (changed.indexOf(edit.old, at + 1) >= 0) throw new ThreadError('invalid', `The notes contain this more than once, so give more of it: ${edit.old}`);
		changed = changed.slice(0, at) + edit.new + changed.slice(at + edit.old.length);
	}
	return changed.trim();
}

function editedSince(thread: Thread): boolean {
	if (!thread.myEditAt) return false;
	// An edit in the same millisecond as the Session's last look counts as
	// unseen, so my changes are never lost to a tie.
	return !thread.sessionSeenAt || thread.myEditAt >= thread.sessionSeenAt;
}
