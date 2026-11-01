import {childrenOf, type Thread, type TreeRow} from '../../src/core/thread';

export type Column = {parentId: string | null; rows: TreeRow[]; selectedId: string | null};

// The Threads page shows one branch of the tree as columns: the top level,
// then the children of each selected Thread that has any shown. `rows` are
// the rows Home would show, so hidden Threads stay hidden here too.
export function columnsFor(rows: TreeRow[], selectedId: string | null): Column[] {
	const byId = new Map(rows.map(row => [row.thread.id, row.thread]));
	const path: string[] = [];
	for (let at = selectedId ? byId.get(selectedId) : undefined; at; at = at.parentId ? byId.get(at.parentId) : undefined) path.unshift(at.id);
	const under = (parentId: string | null) => rows.filter(row => row.thread.parentId === parentId);
	const parents = [null, ...path.filter(id => under(id).length > 0)];
	return parents.map((parentId, i) => ({parentId, rows: under(parentId), selectedId: path[i] ?? null}));
}

// The Threads as they will be once the API has moved `id` under `parentId`
// at `index` among its new siblings, so the page can show the move at once.
// It follows the same rule as the API: the others close up and keep their
// order. `index` counts every sibling, shown or hidden.
export function moved(threads: Thread[], id: string, parentId: string | null, index: number): Thread[] {
	const thread = threads.find(t => t.id === id);
	if (!thread) return threads;
	const order = childrenOf(threads, parentId).filter(t => t.id !== id);
	order.splice(Math.max(0, Math.min(index, order.length)), 0, {...thread, parentId});
	const placed = new Map(order.map((t, position) => [t.id, {...t, position}]));
	return threads.map(t => placed.get(t.id) ?? t);
}
