// Where projects and areas land when they are dragged in the sidebar. The
// sidebar lists projects in no area, then each area followed by its
// projects, so a project's area is whichever area is above it once dropped.

import type {Area, InArea, Project} from '../../src/core/project';

// One row of the sidebar's projects and areas, in the order they show.
export type SidebarRow = {kind: 'project'; id: string} | {kind: 'area'; id: string};

const byPosition = (a: {position: number}, b: {position: number}) => a.position - b.position;

// The open projects and areas as the sidebar shows them.
export function sidebarRows(projects: Project[], areas: Area[]): SidebarRow[] {
	const open = projects.filter(p => p.ended === 'not_ended').sort(byPosition);
	const row = (p: Project): SidebarRow => ({kind: 'project', id: p.id});
	return [
		...open.filter(p => p.area.kind === 'none').map(row),
		...areas.filter(a => a.ended === 'not_ended').sort(byPosition).flatMap(a => [
			{kind: 'area', id: a.id} as SidebarRow,
			...open.filter(p => p.area.kind === 'in' && p.area.id === a.id).map(row),
		]),
	];
}

const sameRow = (a: SidebarRow, b: SidebarRow) => a.kind === b.kind && a.id === b.id;

// The projects dropped on a row: they go just after it when dragged down and
// just before it when dragged up, as the rows make room while dragging, and
// keep the order they had. Each project changed gets its area and a place
// taken from the positions the shown projects already hold, so nothing else
// moves.
export function projectsDropped(rows: SidebarRow[], projects: Project[], moving: string[], active: string, over: SidebarRow): {id: string; area: InArea; position: number}[] {
	const isMoving = (row: SidebarRow) => row.kind === 'project' && moving.includes(row.id);
	if (isMoving(over)) return [];
	const down = rows.findIndex(row => sameRow(row, over)) > rows.findIndex(row => row.kind === 'project' && row.id === active);
	const rest = rows.filter(row => !isMoving(row));
	const at = rest.findIndex(row => sameRow(row, over)) + (down ? 1 : 0);
	const order = [...rest.slice(0, at), ...rows.filter(isMoving), ...rest.slice(at)];
	const byId = new Map(projects.map(p => [p.id, p]));
	const slots = rows.flatMap(row => (row.kind === 'project' ? [byId.get(row.id)!.position] : [])).sort((a, b) => a - b);
	let area: InArea = {kind: 'none'};
	let slot = 0;
	const changed: {id: string; area: InArea; position: number}[] = [];
	for (const row of order) {
		if (row.kind === 'area') {
			area = {kind: 'in', id: row.id};
			continue;
		}
		const project = byId.get(row.id)!;
		const position = slots[slot++]!;
		const sameArea = project.area.kind === area.kind && (area.kind === 'none' || (project.area.kind === 'in' && project.area.id === area.id));
		if (!sameArea || project.position !== position) changed.push({id: row.id, area, position});
	}
	return changed;
}

// An area dropped on another takes its place, the others shifting to make
// room, with places taken from the positions the shown areas already hold.
export function areaDropped(areas: Area[], active: string, over: string): {id: string; position: number}[] {
	const open = areas.filter(a => a.ended === 'not_ended').sort(byPosition);
	const from = open.findIndex(a => a.id === active);
	const to = open.findIndex(a => a.id === over);
	if (from < 0 || to < 0 || from === to) return [];
	const order = open.filter(a => a.id !== active);
	order.splice(to, 0, open[from]!);
	return order.flatMap((a, i) => (a.position === open[i]!.position ? [] : [{id: a.id, position: open[i]!.position}]));
}

// Escape cancels a drag, and on a narrow screen it would also close the
// sidebar's sheet the drag is in. `watch` listens on the window in the
// capture phase, so it sees the press before either of them does, while the
// drag is still on, and the sheet can stay open for that press and close on
// the next.
export function dragEscape(dragging: () => boolean): {watch: (event: Event) => void; endsDrag: (event: Event) => boolean} {
	let ending: Event | null = null;
	return {
		// dnd-kit cancels a drag on this same code.
		watch: event => {
			ending = (event as KeyboardEvent).code === 'Escape' && dragging() ? event : null;
		},
		endsDrag: event => event === ending,
	};
}
