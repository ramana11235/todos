import type {Task} from '../../src/core/task';
import {treeRows, type Thread} from '../../src/core/thread';
import {today} from './days';

export type GroupRow = {kind: 'thread'; thread: Thread} | {kind: 'task'; task: Task};

// A list's Tasks as the terminal task panel shows them: those with no Thread
// first, then a group under each Thread's title in tree order. Tasks keep
// the order they come in. A Task whose Thread is not known yet, such as
// before the Threads have loaded, shows with no Thread rather than vanishing.
// A Thread in `also` gets its heading even with no Tasks, as Someday Threads
// do in Someday.
export function groupedByThread(tasks: Task[], threads: Thread[], also: Thread[] = []): GroupRow[] {
	const known = new Set(threads.map(thread => thread.id));
	const rows: GroupRow[] = tasks.filter(task => !task.threadId || !known.has(task.threadId)).map(task => ({kind: 'task', task}));
	for (const {thread} of treeRows(threads, {view: 'all', today: today()})) {
		const group = tasks.filter(task => task.threadId === thread.id);
		if (group.length || also.includes(thread)) rows.push({kind: 'thread', thread}, ...group.map(task => ({kind: 'task' as const, task})));
	}
	return rows;
}

// Upcoming's rows: a heading for each day in date order, and within a day
// the Tasks grouped only by Thread, so it has no more than two levels of
// headings. A Thread that comes back on a day still ahead gets its heading
// under that day even with no Tasks.
export function upcomingRows(tasks: Task[], threads: Thread[], today: string): ({kind: 'day'; day: string} | GroupRow)[] {
	const dayIn = (item: Task | Thread) => (item.when.kind === 'on_day' ? item.when.day : '');
	const back = threads.filter(thread => thread.ended === 'not_ended' && thread.when.kind === 'on_day' && thread.when.day > today);
	const inOrder = [...tasks].sort((a, b) => a.position - b.position);
	return [...new Set([...tasks, ...back].map(dayIn))].sort().flatMap(day => [
		{kind: 'day' as const, day},
		...groupedByThread(inOrder.filter(task => dayIn(task) === day), threads, back.filter(thread => dayIn(thread) === day)),
	]);
}
