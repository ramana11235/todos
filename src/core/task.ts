// A Task and the pure rules about which list it is in and how a list is
// laid out. Nothing here touches storage, the terminal or the network.

import {groupedByBelonging, taskBelongs, type Belonging, type Belongs} from './project.js';
import {treeRows, type Deadline, type Ended, type Thread} from './thread.js';

// Where a Task was put. Upcoming is never set: a Task is in it because its
// Date is still ahead.
export type Place = 'inbox' | 'today' | 'anytime' | 'someday';

export const places: Place[] = ['inbox', 'today', 'anytime', 'someday'];

export type List = Place | 'upcoming';

export const lists: List[] = ['inbox', 'today', 'anytime', 'upcoming', 'someday'];

export const listNames: Record<List, string> = {
	inbox: 'Inbox',
	today: 'Today',
	anytime: 'Anytime',
	upcoming: 'Upcoming',
	someday: 'Someday',
};

// The list I put a Task in, or a day: on that day the Task moves into Today,
// and until then it is in Upcoming.
export type TaskWhen = {kind: Place} | {kind: 'on_day'; day: string};

// A step inside a Task. It is in no list and has no Date.
export type Step = {id: string; title: string; done: boolean};

export type Task = {
	id: string;
	title: string;
	when: TaskWhen;
	threadId: string | null;
	// Set only on a Task with no Thread, as a Task links to one Thread,
	// project or area at most; one linked to a Thread belongs where it does.
	belongs: Belongs;
	position: number;
	// A day by which the Task must be done. It never moves the Task.
	deadline: Deadline;
	notes: string;
	checklist: Step[];
	ended: Ended;
	endedAt: string | null;
	createdAt: string;
};

// `today` is a day such as 2026-10-18, in my own time zone.
export function listOf(task: Task, today: string): List {
	if (task.when.kind === 'on_day') return task.when.day > today ? 'upcoming' : 'today';
	return task.when.kind;
}

export const dayOf = (date: Date): string =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Whether a value is a real day such as 2026-10-23.
export const isDay = (value: unknown): value is string => typeof value === 'string' && dayOf(new Date(`${value}T12:00`)) === value;

export type TaskRow = {kind: 'belonging'; belonging: Belonging} | {kind: 'day'; day: string} | {kind: 'header'; thread: Thread} | {kind: 'task'; task: Task};

// The rows of one list: Tasks that belong nowhere first, then a heading for
// each project or area in `order` with its Tasks. Within each, Tasks with no
// Thread come first, then a group under each Thread's title in tree order.
// Within a group Tasks keep their order. Upcoming instead has a heading for
// each day, in date order, and groups only by Thread within a day, so it
// still has no more than two levels of headings.
export function listRows(tasks: Task[], threads: Thread[], list: List, today: string, order: Belonging[]): TaskRow[] {
	const inList = tasks.filter(task => listOf(task, today) === list).sort((a, b) => a.position - b.position);
	if (list === 'upcoming') {
		return [...new Set(inList.map(dayIn))].sort().flatMap((day): TaskRow[] => [
			{kind: 'day', day},
			...byThread(inList.filter(task => dayIn(task) === day), threads, today),
		]);
	}
	return groupedByBelonging(inList, task => taskBelongs(task, threads), order).flatMap(({heading, items}): TaskRow[] => [
		...(heading ? [{kind: 'belonging' as const, belonging: heading}] : []),
		...byThread(items, threads, today),
	]);
}

function byThread(inList: Task[], threads: Thread[], today: string): TaskRow[] {
	const rows: TaskRow[] = inList.filter(task => !task.threadId).map(task => ({kind: 'task', task}));
	for (const {thread} of treeRows(threads, {view: 'all', today})) {
		const group = inList.filter(task => task.threadId === thread.id);
		if (group.length) rows.push({kind: 'header', thread}, ...group.map(task => ({kind: 'task' as const, task})));
	}
	return rows;
}

// Only Tasks with a day are in Upcoming.
const dayIn = (task: Task) => (task.when.kind === 'on_day' ? task.when.day : '');
