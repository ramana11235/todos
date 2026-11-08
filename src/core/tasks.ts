// Everything that changes Tasks goes through here, so the rules in
// CONTEXT.md hold whichever client asks.

import {randomUUID} from 'node:crypto';
import type {Storage} from '../storage/storage.js';
import type {Belongs} from './project.js';
import {clockThatNeverGoesOff, reminderAfter, reminderAt, requireReminder, wake, type Reminder, type ReminderClock} from './reminder.js';
import {requireBelongs} from './projects.js';
import {dayOf, isDay, listOf, places, whenAfter, type Place, type Step, type Task, type TaskWhen} from './task.js';
import type {Deadline, Ended, Thread} from './thread.js';
import {changedFields, refuseOldFields, requireDeadline, requireEnded, ThreadError, type Threads} from './threads.js';

// A step as it is sent: one without an id is new, and one without done is
// not ticked.
export type StepEdit = {id?: string; title: string; done?: boolean};

export type NewTask = {
	title: string;
	when?: TaskWhen;
	threadId?: string | null;
	// A project or area, for a Task with no Thread.
	belongs?: Belongs;
	notes?: string;
	deadline?: Deadline;
	reminder?: Reminder;
	checklist?: StepEdit[];
	index?: number;
	// The Task the new one goes right after. It then takes that Task's When
	// and link, so it lands in the same group of the same list.
	after?: string | null;
};

export type TaskEdit = {
	title?: string;
	ended?: Ended;
	when?: TaskWhen;
	// A Task links to one Thread, project or area at most, so linking it to
	// one takes it out of the other.
	threadId?: string | null;
	belongs?: Belongs;
	deadline?: Deadline;
	// {kind: "set", at} or {kind: "none"}; opening a due Reminder's Task from
	// the bell clears it.
	reminder?: Reminder;
	notes?: string;
	// The whole Checklist, which replaces the one there.
	checklist?: StepEdit[];
	// Where it sits among the Tasks of its list, the lowest first.
	position?: number;
	// Its place among the Tasks of its list and Thread, 0 for first, which
	// becomes a position between its new neighbours.
	index?: number;
};

export class Tasks {
	constructor(
		private readonly storage: Storage,
		private readonly now: () => Date = () => new Date(),
		private readonly clock: ReminderClock = clockThatNeverGoesOff,
	) {}

	// Only open Tasks: once a Task ends it leaves every list.
	async list(): Promise<Task[]> {
		return (await this.storage.listTasks()).filter(task => task.ended === 'not_ended');
	}

	// Done and Dropped Tasks, the most recently ended first.
	async logbook(): Promise<Task[]> {
		return (await this.storage.listTasks()).filter(task => task.ended !== 'not_ended').sort((a, b) => b.endedAt!.localeCompare(a.endedAt!));
	}

	async get(id: string): Promise<Task> {
		const task = await this.storage.getTask(id);
		if (!task) throw new ThreadError('not_found', `No Task ${id}`);
		return task;
	}

	async add(newTask: NewTask): Promise<Task> {
		refuseOldFields(newTask, oldFields);
		const {title, when = {kind: 'inbox'}, threadId = null, belongs = {kind: 'none'}, notes = '', deadline = {kind: 'none'}, reminder = {kind: 'none'}, checklist = [], index, after = null} = newTask;
		const all = await this.storage.listTasks();
		const task: Task = {
			id: randomUUID(),
			title: requireTitle(title),
			when: requireWhen(when),
			threadId,
			belongs: await requireBelongs(this.storage, belongs),
			position: all.length === 0 ? 0 : Math.max(...all.map(t => t.position)) + 1,
			deadline: requireDeadline(deadline),
			reminder: reminderAt(requireReminder(reminder), this.now()),
			notes: String(notes),
			checklist: requireChecklist(checklist),
			ended: 'not_ended',
			endedAt: null,
			createdAt: this.now().toISOString(),
		};
		if (after) {
			const before = await this.get(after);
			const group = await this.groupOf(before);
			Object.assign(task, {
				when: before.when,
				threadId: before.threadId,
				belongs: before.belongs,
				position: await this.between(group, group.findIndex(t => t.id === before.id) + 1, before.position + 1),
			});
		} else if (threadId && !(await this.storage.getThread(threadId))) {
			throw new ThreadError('not_found', `No Thread ${threadId}`);
		}
		refuseTwoLinks(task.threadId, task.belongs);
		task.when = whenAfter(task, {});
		if (index !== undefined) task.position = await this.positionAt(task, index);
		await this.storage.saveTask(task);
		await wake(this.clock, {kind: 'task', id: task.id}, {kind: 'none'}, task.reminder);
		return task;
	}

	async edit(id: string, edit: TaskEdit): Promise<Task> {
		refuseOldFields(edit, [...oldFields, 'done']);
		const task = await this.get(id);
		const next = {...task};
		if (edit.title !== undefined) next.title = requireTitle(edit.title);
		if (edit.ended !== undefined) {
			next.ended = requireEnded(edit.ended);
			next.endedAt = next.ended === 'not_ended' ? null : this.now().toISOString();
		}
		if (edit.when !== undefined) next.when = requireWhen(edit.when);
		if (edit.deadline !== undefined) next.deadline = requireDeadline(edit.deadline);
		next.reminder = reminderAfter(task.reminder, edit.reminder, next.ended, this.now());
		if (edit.notes !== undefined) next.notes = String(edit.notes);
		if (edit.checklist !== undefined) next.checklist = requireChecklist(edit.checklist);
		if (edit.position !== undefined) {
			if (typeof edit.position !== 'number' || !Number.isFinite(edit.position)) throw new ThreadError('invalid', 'A position must be a number');
			next.position = edit.position;
		}
		if (edit.threadId !== undefined) {
			if (edit.threadId && !(await this.storage.getThread(edit.threadId))) throw new ThreadError('not_found', `No Thread ${edit.threadId}`);
			next.threadId = edit.threadId;
			if (edit.threadId) next.belongs = {kind: 'none'};
		}
		if (edit.belongs !== undefined) {
			next.belongs = await requireBelongs(this.storage, edit.belongs);
			if (next.belongs.kind !== 'none') {
				if (edit.threadId) refuseTwoLinks(edit.threadId, next.belongs);
				next.threadId = null;
			}
		}
		next.when = whenAfter(next, {});
		if (edit.index !== undefined) next.position = await this.positionAt(next, edit.index);
		await this.storage.updateTask(id, changedFields(task, next));
		await wake(this.clock, {kind: 'task', id}, task.reminder, next.reminder);
		return next;
	}

	// Turns a Task into a new Thread under `parentId`: the Thread takes its
	// title, Notes and Deadline, and at the top level what the Task belongs to, comes back on the Task's day if it was in
	// Upcoming, stays Someday if it was in Someday and is Active otherwise.
	// Each checklist step becomes a Task linked to it in Anytime, ticked if
	// the step was, and the Task is gone (CONTEXT.md). The Thread and its
	// Tasks are saved before the Task goes, so a failure part way leaves the
	// Task as it was rather than losing anything. The steps are written in one
	// query, so a long checklist costs no more queries than a short one.
	async turnIntoThread(id: string, parentId: string | null, threads: Threads): Promise<Thread> {
		const task = await this.get(id);
		if (task.ended !== 'not_ended') throw new ThreadError('invalid', 'Only an open Task can be turned into a Thread');
		const list = listOf(task, this.today());
		const thread = await threads.create({
			title: task.title,
			parentId,
			notes: task.notes,
			when: task.when.kind === 'on_day' && list === 'upcoming' ? task.when : list === 'someday' ? {kind: 'someday'} : {kind: 'active'},
			deadline: task.deadline,
			belongs: parentId === null ? task.belongs : undefined,
		});
		const all = await this.storage.listTasks();
		let position = all.length === 0 ? 0 : Math.max(...all.map(t => t.position)) + 1;
		await this.storage.saveTasks(task.checklist.map(step => ({
			id: randomUUID(),
			title: step.title,
			when: {kind: 'anytime'},
			threadId: thread.id,
			belongs: {kind: 'none'},
			position: position++,
			deadline: {kind: 'none'},
			reminder: {kind: 'none'},
			notes: '',
			checklist: [],
			ended: step.done ? 'done' : 'not_ended',
			endedAt: step.done ? this.now().toISOString() : null,
			createdAt: this.now().toISOString(),
		})));
		await this.storage.deleteTask(task.id);
		await this.clock.clear({kind: 'task', id: task.id});
		return thread;
	}

	// Moves a Task one step within its group. Upcoming is in date order, so
	// nothing moves there.
	async reorder(id: string, direction: 'up' | 'down'): Promise<void> {
		const task = await this.get(id);
		if (listOf(task, this.today()) === 'upcoming') return;
		const group = await this.groupOf(task);
		const index = group.findIndex(t => t.id === id);
		const other = group[direction === 'up' ? index - 1 : index + 1];
		if (!other) return;
		await this.storage.updateTask(task.id, {position: other.position});
		await this.storage.updateTask(other.id, {position: task.position});
	}

	// Usually only one Task is written, so it goes between its neighbours
	// rather than renumbering the group.
	private async positionAt(task: Task, index: number): Promise<number> {
		if (!Number.isInteger(index) || index < 0) throw new ThreadError('invalid', 'A place in a list is a whole number from 0');
		if (task.ended !== 'not_ended') throw new ThreadError('invalid', 'A done or dropped Task has no place in a list');
		if (listOf(task, this.today()) === 'upcoming') throw new ThreadError('invalid', 'Upcoming is in date order, so a Task cannot be placed there');
		const group = (await this.groupOf(task)).filter(t => t.id !== task.id);
		return this.between(group, Math.min(index, group.length), task.position);
	}

	// The position for a Task going in at `at` in `group`, which is in order.
	// Halving a gap runs out after about 50 Tasks put in the same place, when
	// halfway comes out equal to a neighbour, so the group is then numbered
	// again from 0 in its order and the Task goes between two whole numbers.
	private async between(group: Task[], at: number, alone: number): Promise<number> {
		const [before, after] = [group[at - 1], group[at]];
		if (!before || !after) return after ? after.position - 1 : before ? before.position + 1 : alone;
		const half = (before.position + after.position) / 2;
		if (half !== before.position && half !== after.position) return half;
		await this.storage.renumberTasks(group.map(task => task.id));
		return at - 0.5;
	}

	// The open Tasks in the same list and under the same Thread, in order.
	private async groupOf(task: Task): Promise<Task[]> {
		const today = this.today();
		return (await this.list())
			.filter(t => t.threadId === task.threadId && listOf(t, today) === listOf(task, today))
			.sort((a, b) => a.position - b.position);
	}

	// shortcut: the day is taken in the API's own time zone, which is mine on
	// a laptop; the cloud will need the user's zone passed in.
	private today(): string {
		return dayOf(this.now());
	}
}

function refuseTwoLinks(threadId: string | null, belongs: Belongs): void {
	if (threadId && belongs.kind !== 'none') throw new ThreadError('invalid', 'A Task links to one Thread, project or area at most');
}

function requireChecklist(checklist: unknown): Step[] {
	if (!Array.isArray(checklist)) throw new ThreadError('invalid', 'A Checklist is a list of steps');
	return checklist.map(step => ({id: String(step?.id ?? randomUUID()), title: requireTitle(step?.title ?? ''), done: Boolean(step?.done)}));
}

// Fields that only clients older than When, Ended and Deadline send.
const oldFields = ['state', 'place', 'date'];

// Days are compared as text, so anything but a real day such as 2026-10-23
// would never come round.
function requireWhen(value: unknown): TaskWhen {
	const when = value as {kind?: unknown; day?: unknown} | null;
	if (places.includes(when?.kind as Place)) return {kind: when!.kind as Place};
	if (when?.kind === 'on_day' && isDay(when.day)) return {kind: 'on_day', day: when.day};
	throw new ThreadError('invalid', `A Task's When is {kind: "${places.join('" | "')}"} or {kind: "on_day", day: "2026-10-23"}`);
}

function requireTitle(title: string): string {
	const trimmed = title.trim();
	if (!trimmed) throw new ThreadError('invalid', 'A Task needs a title');
	return trimmed;
}
