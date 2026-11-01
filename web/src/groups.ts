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
