// A Thread and the pure rules about it. Nothing here touches storage,
// the terminal or the network, so every client can use these rules.

import type {Belongs} from './project.js';

// Who acts next: me, or someone or something else (CONTEXT.md). Working is
// not set; it shows while the Thread's Session is busy.
export type WhoseMove = 'on_me' | 'waiting';

export type ShownMove = 'working' | WhoseMove;

// Whether the Thread is one I am working on now. On its day a Thread with a
// day is Active again, as if I had brought it in.
export type When = {kind: 'active'} | {kind: 'someday'} | {kind: 'on_day'; day: string};

export type Ended = 'not_ended' | 'done' | 'dropped';

// A day by which the Thread must be done. It never moves the Thread.
export type Deadline = {kind: 'none'} | {kind: 'by_day'; day: string};

// What the app last heard from a Thread's Session. It only feeds the
// state that is shown, and is never shown itself.
export type SessionSignal = 'busy' | 'asking' | 'finished';

export type Thread = {
	id: string;
	title: string;
	summary: string;
	nextStep: string;
	// The full detail, from which the summary is drawn (CONTEXT.md).
	notes: string;
	whoseMove: WhoseMove;
	when: When;
	ended: Ended;
	deadline: Deadline;
	parentId: string | null;
	// Set only on a Thread at the top of its tree; the Threads under it
	// belong where it does, and keep none of their own.
	belongs: Belongs;
	position: number;
	directory: string | null;
	claudeSessionId: string | null;
	sessionPane: string | null;
	sessionSignal: SessionSignal | null;
	myEditAt: string | null;
	// The last time the Session read or wrote this Thread.
	sessionSeenAt: string | null;
	// When the summary or next step last changed, by me or by the Session.
	summaryUpdatedAt: string | null;
	createdAt: string;
};

// A prompt for a Thread's Session, kept until the laptop running Home types
// it in (docs/adr/0003). With no text it only asks for the Session to start.
export type Prompt = {
	id: string;
	threadId: string;
	text: string | null;
	createdAt: string;
};

// `today` is a day such as 2026-10-18, in my own time zone.
// A project is Active in the same way.
export function isActive(thread: {ended: Ended; when: When}, today: string): boolean {
	if (thread.ended !== 'not_ended') return false;
	return thread.when.kind === 'active' || (thread.when.kind === 'on_day' && thread.when.day <= today);
}

export function shownMove(thread: Thread): ShownMove {
	if (thread.sessionSignal === 'busy') return 'working';
	if (thread.sessionSignal === 'asking') return 'on_me';
	return thread.whoseMove;
}

export function childrenOf(threads: Thread[], parentId: string | null): Thread[] {
	return threads
		.filter(thread => thread.parentId === parentId)
		// Two Threads made at the same moment can share a position, so the
		// older one comes first and the order never changes between loads.
		.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

export function ancestorsOf(threads: Thread[], id: string): Thread[] {
	const byId = new Map(threads.map(thread => [thread.id, thread]));
	const ancestors: Thread[] = [];
	let parentId = byId.get(id)?.parentId ?? null;
	while (parentId) {
		const parent = byId.get(parentId);
		if (!parent) break;
		ancestors.push(parent);
		parentId = parent.parentId;
	}
	return ancestors;
}

export function descendantsOf(threads: Thread[], id: string): Thread[] {
	const found: Thread[] = [];
	const visit = (parentId: string) => {
		for (const child of childrenOf(threads, parentId)) {
			found.push(child);
			visit(child.id);
		}
	};
	visit(id);
	return found;
}

export function isBelow(threads: Thread[], id: string, ancestorId: string): boolean {
	return ancestorsOf(threads, id).some(ancestor => ancestor.id === ancestorId);
}

export function directoryOf(threads: Thread[], id: string): string | null {
	const thread = threads.find(candidate => candidate.id === id);
	if (!thread) return null;
	if (thread.directory) return thread.directory;
	return ancestorsOf(threads, id).find(ancestor => ancestor.directory)?.directory ?? null;
}

// Home shows the Active Threads. bring_in adds the open ones I could bring
// in, ended shows only the ended ones, and all shows every Thread.
export type View = 'active' | 'bring_in' | 'ended' | 'all';

function belongs(thread: Thread, view: View, today: string): boolean {
	if (view === 'all') return true;
	if (view === 'ended') return thread.ended !== 'not_ended';
	return view === 'bring_in' ? thread.ended === 'not_ended' : isActive(thread, today);
}

export type TreeRow = {
	thread: Thread;
	depth: number;
	shown: ShownMove;
	// Shown only to hold the tree together, kept in view for a moment, or
	// one I could bring in.
	dimmed: boolean;
	hasChildren: boolean;
	// Set when the Thread is folded: how many rows it hides, and whether any
	// of them is On me.
	folded: {hidden: number; onMeBelow: boolean} | null;
};

// The rows of one view, in tree order. A Thread outside the view is still
// shown, dimmed, when one inside it sits below it, or when it is in `keep`,
// such as one that has just left the view. A folded Thread hides the rows
// below it.
export function treeRows(
	threads: Thread[],
	{view, today, folded = new Set(), keep = new Set()}: {view: View; today: string; folded?: ReadonlySet<string>; keep?: ReadonlySet<string>},
): TreeRow[] {
	const rowsUnder = (parentId: string | null, depth: number): TreeRow[] => {
		const rows: TreeRow[] = [];
		for (const thread of childrenOf(threads, parentId)) {
			const below = rowsUnder(thread.id, depth + 1);
			const own = belongs(thread, view, today);
			if (!own && below.length === 0 && !keep.has(thread.id)) continue;
			const isFolded = folded.has(thread.id) && below.length > 0;
			const dimmed = !own || keep.has(thread.id) || (view !== 'ended' && !isActive(thread, today));
			rows.push({
				thread,
				depth,
				shown: shownMove(thread),
				dimmed,
				hasChildren: childrenOf(threads, thread.id).length > 0,
				folded: isFolded ? {hidden: below.length, onMeBelow: below.some(row => row.shown === 'on_me' && !row.dimmed)} : null,
			});
			if (!isFolded) rows.push(...below);
		}
		return rows;
	};
	return rowsUnder(null, 0);
}
