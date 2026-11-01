import {groupedByThread, type GroupRow, type Task} from '../../src/core/task';
import type {Thread} from '../../src/core/thread';

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
		...groupedByThread(inOrder.filter(task => dayIn(task) === day), threads, today, back.filter(thread => dayIn(thread) === day)),
	]);
}
