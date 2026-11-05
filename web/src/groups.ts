import type {Belonging, Project} from '../../src/core/project';
import {groupedByThread, type GroupRow, type Task} from '../../src/core/task';
import type {Thread} from '../../src/core/thread';

// Upcoming's rows: a heading for each day in date order, and within a day
// the Tasks grouped only by Thread, so it has no more than two levels of
// headings. A Thread that comes back on a day still ahead gets its heading
// under that day even with no Tasks, and so does a project, after them,
// with its Tasks staying under their own days. Ended Tasks sink to the bottom
// of their day unless they are in `stay`, as endedLast says.
export function upcomingRows(
	tasks: Task[],
	threads: Thread[],
	today: string,
	stay: ReadonlySet<string> = new Set(),
	projects: Project[] = [],
	order: Belonging[] = [],
): ({kind: 'day'; day: string} | {kind: 'belonging'; belonging: Belonging} | GroupRow)[] {
	const dayIn = (item: Task | Thread | Project) => (item.when.kind === 'on_day' ? item.when.day : '');
	const comingBack = <T extends Thread | Project>(all: T[]) => all.filter(one => one.ended === 'not_ended' && one.when.kind === 'on_day' && one.when.day > today);
	const back = comingBack(threads);
	const projectsBack = comingBack(projects);
	const inOrder = [...tasks].sort((a, b) => endedLast(stay)(a, b) || a.position - b.position);
	return [...new Set([...tasks, ...back, ...projectsBack].map(dayIn))].sort().flatMap(day => [
		{kind: 'day' as const, day},
		...groupedByThread(inOrder.filter(task => dayIn(task) === day), threads, today, back.filter(thread => dayIn(thread) === day)),
		...order.filter(one => one.belongs.kind === 'project' && projectsBack.some(p => dayIn(p) === day && p.id === (one.belongs as {id: string}).id)).map(belonging => ({kind: 'belonging' as const, belonging})),
	]);
}

// A Task ended in view goes below the open ones, in the order they ended,
// except one in `stay`, which keeps its place for now: one I just ended, for
// half a second so I see it done, or one a Session ended (docs/animation.md).
// Tasks this ranks the same are left to the caller's own order.
export const endedLast = (stay: ReadonlySet<string>) => (a: Task, b: Task) => {
	const sunk = (t: Task) => t.ended !== 'not_ended' && !stay.has(t.id);
	return Number(sunk(a)) - Number(sunk(b)) || (sunk(a) && sunk(b) ? (a.endedAt ?? '').localeCompare(b.endedAt ?? '') : 0);
};

// The Tasks on screen that are no longer open and were not changed here, so
// a Session or another device ended them, or they are gone altogether.
export const leftElsewhere = (onScreen: string[], open: Task[], kept: ReadonlyMap<string, Task>) => {
	const still = new Set(open.map(t => t.id));
	return onScreen.filter(id => !still.has(id) && !kept.has(id));
};
