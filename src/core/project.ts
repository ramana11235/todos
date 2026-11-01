// Projects and areas, and the pure rules about what belongs to them. They
// stand beside Threads rather than being kinds of Thread (docs/adr/0006).

import type {Task} from './task.js';
import {treeRows, type Deadline, type Ended, type Thread, type TreeRow} from './thread.js';

// A part of my life that is never finished, such as Health. It is in use
// until it is Dropped, and is never Done.
export type Area = {
	id: string;
	title: string;
	notes: string;
	ended: 'not_ended' | 'dropped';
	// Where it sits among the areas in the sidebar, the lowest first.
	position: number;
	createdAt: string;
};

// The area a project sits in, if any.
export type InArea = {kind: 'none'} | {kind: 'in'; id: string};

// An outcome made of Threads and Tasks, such as Build todos.
export type Project = {
	id: string;
	title: string;
	notes: string;
	area: InArea;
	deadline: Deadline;
	ended: Ended;
	// Where it sits among the projects in the sidebar, the lowest first.
	position: number;
	createdAt: string;
};

// What a Thread at the top of its tree, or a Task with no Thread, belongs to.
export type Belongs = {kind: 'none'} | {kind: 'project'; id: string} | {kind: 'area'; id: string};

export const sameBelongs = (a: Belongs, b: Belongs): boolean =>
	a.kind === b.kind && (a.kind === 'none' || a.id === (b as {id: string}).id);

// A Thread belongs where the Thread at the top of its tree does.
export function threadBelongs(thread: Thread, threads: Thread[]): Belongs {
	const byId = new Map(threads.map(candidate => [candidate.id, candidate]));
	let top = thread;
	while (top.parentId && byId.has(top.parentId)) top = byId.get(top.parentId)!;
	return top.belongs;
}

// The titles of the area and project something belongs to, the area first,
// as in "Software › Build todos". Empty when it belongs nowhere.
export function belongsPath(belongs: Belongs, projects: Project[], areas: Area[]): string[] {
	const project = belongs.kind === 'project' ? projects.find(candidate => candidate.id === belongs.id) : undefined;
	const areaId = belongs.kind === 'area' ? belongs.id : project?.area.kind === 'in' ? project.area.id : undefined;
	const area = areas.find(candidate => candidate.id === areaId);
	return [area?.title, project?.title].filter((title): title is string => title !== undefined);
}

// A project or area as a heading: what it is, its titles as belongsPath
// gives them, and whether it has ended, since open work inside an ended one
// still shows under it.
export type Belonging = {belongs: Belongs; path: string[]; ended: Ended};

// The order of the sidebar, which lists follow too: projects in no area,
// then each area followed by its projects, each in the order they were put.
// Ended ones are included, as only the sidebar leaves them out.
export function belongingOrder(projects: Project[], areas: Area[]): Belonging[] {
	const byPosition = <T extends {position: number}>(all: T[]) => [...all].sort((a, b) => a.position - b.position);
	const ofProject = (project: Project): Belonging => {
		const belongs: Belongs = {kind: 'project', id: project.id};
		return {belongs, path: belongsPath(belongs, projects, areas), ended: project.ended};
	};
	const sorted = byPosition(projects);
	return [
		...sorted.filter(project => project.area.kind === 'none').map(ofProject),
		...byPosition(areas).flatMap(area => [
			{belongs: {kind: 'area', id: area.id} as Belongs, path: [area.title], ended: area.ended},
			...sorted.filter(project => project.area.kind === 'in' && project.area.id === area.id).map(ofProject),
		]),
	];
}

// Splits things into those that belong nowhere, then one group for each
// project or area in `order` that has any. Something whose project or area is
// not known yet, such as before they have loaded, goes with those that belong
// nowhere rather than vanishing.
export function groupedByBelonging<T>(items: T[], belongsOf: (item: T) => Belongs, order: Belonging[]): {heading: Belonging | null; items: T[]}[] {
	const known = order.filter(one => one.belongs.kind !== 'none');
	const headingOf = (item: T) => known.find(one => sameBelongs(one.belongs, belongsOf(item))) ?? null;
	const groups = [{heading: null, items: items.filter(item => headingOf(item) === null)}, ...known.map(heading => ({heading, items: items.filter(item => headingOf(item) === heading)}))];
	return groups.filter(group => group.items.length > 0);
}

// A Task linked to a Thread belongs where its Thread does.
export function taskBelongs(task: Task, threads: Thread[]): Belongs {
	const thread = task.threadId ? threads.find(candidate => candidate.id === task.threadId) : undefined;
	return thread ? threadBelongs(thread, threads) : task.belongs;
}

// A row in Home's tree. Projects and areas show there as the parents of the
// Threads in them, so a row is one of the three, at a depth in the tree.
export type HomeRow = {
	id: string;
	title: string;
	depth: number;
	// Set when the row is folded: how many rows it hides, and whether any of
	// them is On me.
	folded: TreeRow['folded'];
	of: {kind: 'thread'; row: TreeRow} | {kind: 'project'; project: Project} | {kind: 'area'; area: Area};
};

// Home's tree: each project in no area, then each area with its projects and
// then its own Threads, then the Threads that belong nowhere. A project or area shows only when
// a Thread shows under it, so Home stays a tree of Threads. A Thread whose
// project or area is not known goes with those that belong nowhere.
export function homeRows(threads: Thread[], projects: Project[], areas: Area[], options: Parameters<typeof treeRows>[1]): HomeRow[] {
	const folded = options.folded ?? new Set<string>();
	const onMe = (row: HomeRow) => (row.of.kind === 'thread' && row.of.row.shown === 'on_me' && !row.of.row.dimmed) || Boolean(row.folded?.onMeBelow);
	// Each Thread at the top of its tree, with the rows under it.
	const trees: {belongs: Belongs; rows: HomeRow[]}[] = [];
	for (const row of treeRows(threads, {...options, folded})) {
		const home: HomeRow = {id: row.thread.id, title: row.thread.title, depth: row.depth, folded: row.folded, of: {kind: 'thread', row}};
		if (row.depth === 0) trees.push({belongs: row.thread.belongs, rows: []});
		trees.at(-1)!.rows.push(home);
	}
	const deeper = (rows: HomeRow[]) => rows.map(row => ({...row, depth: row.depth + 1}));
	const treesIn = (belongs: Belongs) => trees.filter(tree => sameBelongs(tree.belongs, belongs)).flatMap(tree => tree.rows);
	// A project or area row with the rows under it, or nothing when no Thread shows there.
	const parent = (id: string, title: string, of: HomeRow['of'], below: HomeRow[]): HomeRow[] => {
		if (below.length === 0) return [];
		const isFolded = folded.has(id);
		const row: HomeRow = {id, title, depth: 0, folded: isFolded ? {hidden: below.length, onMeBelow: below.some(onMe)} : null, of};
		return isFolded ? [row] : [row, ...deeper(below)];
	};
	const byPosition = <T extends {position: number}>(all: T[]) => [...all].sort((a, b) => a.position - b.position);
	const ofProject = (project: Project) => parent(project.id, project.title, {kind: 'project', project}, treesIn({kind: 'project', id: project.id}));
	const known = new Set([...projects, ...areas].map(one => one.id));
	// A project whose area is not known shows as if it were in none.
	const inNoArea = (project: Project) => project.area.kind === 'none' || !known.has(project.area.id);
	return [
		...byPosition(projects).filter(inNoArea).flatMap(ofProject),
		...byPosition(areas).flatMap(area =>
			parent(area.id, area.title, {kind: 'area', area}, [
				...byPosition(projects).filter(project => project.area.kind === 'in' && project.area.id === area.id).flatMap(ofProject),
				...treesIn({kind: 'area', id: area.id}),
			]),
		),
		...trees.filter(tree => tree.belongs.kind === 'none' || !known.has(tree.belongs.id)).flatMap(tree => tree.rows),
	];
}
