import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
	closestCenter,
	DndContext,
	DragOverlay,
	PointerSensor,
	pointerWithin,
	TouchSensor,
	useDroppable,
	useSensor,
	useSensors,
	type CollisionDetection,
	type DragEndEvent,
	type DragStartEvent,
} from '@dnd-kit/core';
import {SortableContext, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {ArchiveIcon, BookCheckIcon, CalendarDaysIcon, ChevronRightIcon, InboxIcon, LayersIcon, NetworkIcon, PlusIcon, StarIcon, type LucideIcon} from 'lucide-react';
import {toast} from 'sonner';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {ContextMenu, ContextMenuTrigger} from '@/components/ui/context-menu';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Toaster} from '@/components/ui/sonner';
import {TooltipProvider} from '@/components/ui/tooltip';
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
} from '@/components/ui/sidebar';
import {useIsMobile} from '@/hooks/use-mobile';
import {ApiError, Client, type Seen} from '../../src/client/client';
import {belongingOrder, belongsKey, groupedByBelonging, sameBelongs, taskBelongs, threadBelongs, type Area, type Belonging, type Belongs, type Project} from '../../src/core/project';
import type {AreaEdit, ProjectEdit} from '../../src/core/projects';
import {dayOf, groupedByThread, listNames, listOf, lists, whenAfter, type List, type Place, type Task} from '../../src/core/task';
import type {TaskEdit} from '../../src/core/tasks';
import type {MyEdit} from '../../src/core/threads';
import {isActive, shownMove, type Deadline, type Thread} from '../../src/core/thread';
import {SelectionBar, TaskMenu, type Actions} from './Actions';
import {Capture} from './Capture';
import {NewTask, type Draft} from './NewTask';
import {TaskDetail} from './TaskDetail';
import {TaskRow, titleClass} from './TaskRow';
import {moved} from './columns';
import {endedLast, upcomingRows} from './groups';
import {ease, ms, nothingHandled, pinned, stepBack, useMotion, type Handled} from './motion';
import {StateDot} from './StateDot';
import {ThreadsPage} from './Threads';
import {AreaGroup, belongingLabel, BelongingHeading, ConfirmEnd, NewPage, PageItem, PageTop, sortableId, sortableOf, type Page} from './Pages';
import {areaDropped, dragEscape, projectsDropped, sidebarRows} from './sidebar';
import {addDays, dayName, today} from './days';

// A phone on a slow connection can take a while to answer. Giving up early
// would report a change as failed after it was saved, and trying again
// would make it twice.
const client = new Client('', {}, 15_000);
const pollMs = 1500;

// What the main column can show: one of the lists, the Logbook or the
// Threads page.
type View = List | 'logbook' | 'threads';

// The lists in the order every place shows them, then the Logbook and the
// Threads page.
const views: View[] = [...lists, 'logbook', 'threads'];

// Where I am, kept in the address after the #, such as #today,
// #threads/<id>/page or #project/<id>, so Back, a reload and a saved link all
// reach the same place, and the hosted and the local Instance need nothing
// from the server. `shown` is the project or area whose page is open, or none
// for a list.
type Address = {view: View; threadId: string | null; opened: boolean; shown: Belongs};
const hashOf = ({view, threadId, opened, shown}: Address) =>
	shown.kind !== 'none' ? `#${shown.kind}/${shown.id}`
	: view !== 'threads' ? `#${view}` : `#threads${threadId ? `/${threadId}${opened ? '/page' : ''}` : ''}`;
const addressOf = (hash: string): Address => {
	const [view, threadId, page] = hash.replace(/^#/, '').split('/');
	if ((view === 'project' || view === 'area') && threadId) return {view: 'anytime', threadId: null, opened: false, shown: {kind: view, id: threadId}};
	if (!views.includes(view as View)) return {view: 'today', threadId: null, opened: false, shown: {kind: 'none'}};
	return {view: view as View, threadId: view === 'threads' ? threadId || null : null, opened: page === 'page', shown: {kind: 'none'}};
};

const icons: Record<View, [LucideIcon, string]> = {
	inbox: [InboxIcon, 'var(--icon-bright)'],
	today: [StarIcon, 'var(--icon-bright)'],
	upcoming: [CalendarDaysIcon, 'var(--icon-mid)'],
	anytime: [LayersIcon, 'var(--icon-mid)'],
	someday: [ArchiveIcon, 'var(--icon-faint)'],
	logbook: [BookCheckIcon, 'var(--icon-faint)'],
	threads: [NetworkIcon, 'var(--icon-bright)'],
};

const viewNames: Record<View, string> = {...listNames, logbook: 'Logbook', threads: 'Threads'};

// Upcoming is in date order and the Logbook in the order Tasks ended.
const reorderable = (view: View) => view !== 'upcoming' && view !== 'logbook' && view !== 'threads';

type Row = {kind: 'header'; label: string} | {kind: 'belonging'; belonging: Belonging} | {kind: 'thread'; thread: Thread; nested?: boolean} | {kind: 'task'; task: Task};

// Puts a heading over each run of Tasks that share a label, such as a day.
function withHeadings(tasks: Task[], label: (task: Task) => string): Row[] {
	const rows: Row[] = [];
	let last: string | null = null;
	for (const task of tasks) {
		if (label(task) !== last) rows.push({kind: 'header', label: (last = label(task))});
		rows.push({kind: 'task', task});
	}
	return rows;
}

// A Task as it will be once the API has made the change, so the page can
// show it at once. Opening a Task again keeps when it ended, so it keeps its
// place in the Logbook until the view changes.
function applied(task: Task, patch: TaskEdit): Task {
	const next = {...task, ...patch, when: whenAfter(task, patch)} as Task;
	if (patch.ended !== undefined && patch.ended !== 'not_ended') next.endedAt = new Date().toISOString();
	return next;
}

// A message offering Undo stays up for 10 seconds, against the library's
// default of 4, so there is time to read it and reach the button on the phone.
const undoToast = (message: string, onUndo: () => void) =>
	toast(message, {duration: 10_000, action: {label: 'Undo', onClick: onUndo}});

// The change that puts back what `patch` replaces. The API keeps no history,
// so undoing sends this. Linking can also move the Task out of the Inbox, so
// its list is put back too.
function reverseOf(task: Task, patch: TaskEdit): TaskEdit {
	const keys = new Set([...Object.keys(patch), ...(applied(task, patch).when === task.when ? [] : ['when'])]);
	return Object.fromEntries([...keys].map(key => [key, task[key as keyof Task]])) as TaskEdit;
}

const byPosition = (a: {position: number}, b: {position: number}) => a.position - b.position;

const count = (n: number) => (n === 1 ? 'task' : `${n} tasks`);

function ViewItem({view, current, count, onPick}: {view: View; current: View | 'page'; count: number; onPick: (view: View) => void}) {
	const {setOpenMobile} = useSidebar();
	// Tasks dragged onto a list move there, and onto the Logbook are ticked
	// off. Upcoming needs a Date and the Threads page is not a list, so
	// nothing can be dropped on them.
	const {setNodeRef, isOver} = useDroppable({id: `list:${view}`, disabled: view === 'upcoming' || view === 'threads' || view === current});
	const [Icon, colour] = icons[view];
	return (
		<SidebarMenuItem ref={setNodeRef}>
			<SidebarMenuButton
				isActive={current === view}
				className={cn(isOver && 'ring-2 ring-primary')}
				onClick={() => {
					onPick(view);
					setOpenMobile(false);
				}}
			>
				<Icon style={{color: colour}} />
				<span>{viewNames[view]}</span>
			</SidebarMenuButton>
			{count > 0 && <SidebarMenuBadge className="text-muted-foreground">{count}</SidebarMenuBadge>}
		</SidebarMenuItem>
	);
}

export function App() {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [ended, setEnded] = useState<Task[]>([]);
	const [threads, setThreads] = useState<Thread[]>([]);
	const [projects, setProjects] = useState<Project[]>([]);
	const [areas, setAreas] = useState<Area[]>([]);
	const [shown, setShown] = useState<Belongs>(() => addressOf(window.location.hash).shown);
	// Ending a project or area with open work inside asks first.
	const [ending, setEnding] = useState<{page: Page; how: 'done' | 'dropped'; open: string[]} | null>(null);
	const [naming, setNaming] = useState<Page['kind'] | null>(null);
	const [view, setViewState] = useState<View>(() => addressOf(window.location.hash).view);
	const [selected, setSelected] = useState<string[]>([]);
	// Where a Shift-click selection runs from.
	const [anchor, setAnchor] = useState<string | null>(null);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [openId, setOpenId] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const [capturing, setCapturing] = useState(false);
	const [dragging, setDragging] = useState<string[]>([]);
	// Projects picked in the sidebar with shift- or cmd-click, and the one a
	// shift-click runs from, as for Tasks.
	const [picked, setPicked] = useState<string[]>([]);
	const pickedFrom = useRef<string | null>(null);
	// What is being dragged in the sidebar, apart from Tasks.
	const [sidebarDrag, setSidebarDrag] = useState<{kind: 'none'} | {kind: 'projects'; ids: string[]} | {kind: 'area'; id: string}>({kind: 'none'});
	// On a phone a tap opens a Task, so picking several is a mode of its own.
	const phone = useIsMobile();
	const [picking, setPicking] = useState(false);
	// Tasks ticked off, dropped or opened again here stay in view until the
	// view changes, so a second click undoes it.
	const [kept, setKept] = useState<Map<string, Task>>(new Map());
	// Kept Tasks that have ended but keep their place for now, as endedLast
	// says.
	const [stay, setStay] = useState<ReadonlySet<string>>(new Set());
	// Each entry puts back one change, the latest last.
	const undoes = useRef<[string, TaskEdit][][]>([]);
	// The Thread picked on the Threads page, kept while I visit a list.
	const [threadId, setThreadId] = useState<string | null>(() => addressOf(window.location.hash).threadId);
	const [opened, setOpened] = useState(() => addressOf(window.location.hash).opened);
	const seen = useRef<Seen>({kind: 'nothing'});

	// Each poll is one request, which answers with nothing when nothing has
	// changed, to spare the hosted Instance's requests and rows read.
	const refresh = useCallback(async () => {
		try {
			const changes = await client.changes(seen.current);
			if (changes.kind === 'same') return;
			seen.current = {kind: 'number', number: changes.number};
			setTasks(changes.tasks);
			setThreads(changes.threads);
			setProjects(changes.projects);
			setAreas(changes.areas);
			if (view === 'logbook') setEnded(await client.logbook());
		} catch (error) {
			// Once the Cloudflare Access sign-in runs out, Access answers with a
			// redirect to its sign-in page, which reaches here as status 0.
			// Loading the page again goes through that sign-in and back here.
			if (error instanceof ApiError && error.status === 0) window.location.reload();
			// Otherwise the API may be restarting for a new build; the next poll
			// catches up.
		}
	}, [view]);

	// The Logbook is read when it opens, as well as after each change.
	useEffect(() => {
		if (view === 'logbook') void client.logbook().then(setEnded, () => {});
	}, [view]);

	// Only a page on screen asks for changes, since the hosted Instance counts
	// every request, and coming back to the page catches up at once.
	useEffect(() => {
		void refresh();
		const timer = setInterval(() => {
			if (document.visibilityState === 'visible') void refresh();
		}, pollMs);
		const onShow = () => {
			if (document.visibilityState === 'visible') void refresh();
		};
		document.addEventListener('visibilitychange', onShow);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onShow);
		};
	}, [refresh]);

	// Every Task the page knows, as it is shown. A ref, so Undo in a message
	// shown earlier still sees them as they are now.
	const known = useRef(new Map<string, Task>());
	known.current = new Map([...tasks, ...ended, ...kept.values()].map(t => [t.id, t]));

	const now = today();
	const order = useMemo(() => belongingOrder(projects, areas), [projects, areas]);
	const rows = useMemo((): Row[] => {
		// A page shows what is in it from every list, list by list.
		if (shown.kind !== 'none') {
			const here = [...tasks.filter(t => !kept.has(t.id)), ...kept.values()].filter(t => sameBelongs(taskBelongs(t, threads), shown));
			here.sort((a, b) => endedLast(stay)(a, b) || lists.indexOf(listOf(a, now)) - lists.indexOf(listOf(b, now)) || a.position - b.position);
			const open = threads.filter(t => t.ended === 'not_ended' && t.parentId === null && sameBelongs(t.belongs, shown));
			return groupedByThread(here, threads, now, open);
		}
		if (view === 'logbook') {
			const shown = [...ended.filter(t => !kept.has(t.id)), ...kept.values()];
			shown.sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));
			return withHeadings(shown, t => (t.endedAt ? dayName(dayOf(new Date(t.endedAt))) : ''));
		}
		const inList = [...tasks.filter(t => !kept.has(t.id) && listOf(t, now) === view), ...kept.values()];
		if (view === 'upcoming') return upcomingRows(inList, threads, now, stay).map(row => (row.kind === 'day' ? {kind: 'header', label: dayName(row.day)} : row));
		// Going into Someday is looking, so the Threads parked there show too.
		const parked = view === 'someday' ? threads.filter(t => t.ended === 'not_ended' && t.when.kind === 'someday') : [];
		const items: ({kind: 'task'; task: Task} | {kind: 'thread'; thread: Thread})[] = [
			...inList.sort((a, b) => endedLast(stay)(a, b) || a.position - b.position).map(task => ({kind: 'task' as const, task})),
			...parked.map(thread => ({kind: 'thread' as const, thread})),
		];
		const belongsOf = (item: (typeof items)[number]) => (item.kind === 'task' ? taskBelongs(item.task, threads) : threadBelongs(item.thread, threads));
		return groupedByBelonging(items, belongsOf, order).flatMap(({heading, items: group}): Row[] => [
			...(heading ? [{kind: 'belonging' as const, belonging: heading}] : []),
			// Under a project or area a Thread's heading is a level below, so it
			// loses its rule.
			...groupedByThread(group.flatMap(i => (i.kind === 'task' ? [i.task] : [])), threads, now, group.flatMap(i => (i.kind === 'thread' ? [i.thread] : [])))
				.map(row => (row.kind === 'thread' && heading ? {...row, nested: true} : row)),
		]);
	}, [tasks, ended, kept, stay, view, now, threads, shown, order]);
	// Upcoming itself, not a page opened while it was the list.
	const inUpcoming = view === 'upcoming' && shown.kind === 'none';
	const shownTasks = rows.flatMap(r => (r.kind === 'task' ? [r.task] : []));
	const ids = shownTasks.map(t => t.id);
	// The selected Tasks still in view, in the order they are shown.
	const chosen = ids.filter(id => selected.includes(id));

	const counts = useMemo(() => {
		const c: Record<View, number> = {inbox: 0, today: 0, upcoming: 0, anytime: 0, someday: 0, logbook: 0, threads: 0};
		for (const t of tasks) c[listOf(t, now)]++;
		return c;
	}, [tasks, now]);

	const setView = (next: View) => {
		setViewState(next);
		setShown({kind: 'none'});
		setSelected([]);
		setRenaming(null);
		setOpenId(null);
		setAdding(false);
		setKept(new Map());
		setStay(new Set());
		setPicking(false);
		setOpened(false);
	};

	// Each place I go is a step in the browser's history, so Back and the
	// phone's back swipe go back one place. Picking a Thread in the laptop's
	// columns only replaces the address, so Back does not step through every
	// Thread I passed.
	const hash = hashOf({view, threadId, opened, shown});
	const lastHash = useRef(hash);
	useEffect(() => {
		const last = lastHash.current;
		lastHash.current = hash;
		if (window.location.hash === hash) return;
		const picking = !phone && view === 'threads' && last.startsWith('#threads') && !last.endsWith('/page') && !opened;
		if (!window.location.hash || picking) window.history.replaceState(null, '', hash);
		else window.history.pushState(null, '', hash);
	}, [hash]);
	useEffect(() => {
		const onBack = () => {
			const place = addressOf(window.location.hash);
			setView(place.view);
			if (place.view === 'threads') setThreadId(place.threadId);
			setOpened(place.opened);
			setShown(place.shown);
		};
		window.addEventListener('popstate', onBack);
		return () => window.removeEventListener('popstate', onBack);
	}, []);

	// Rows that change place glide there, as on the Threads page. Each list
	// and page is a view of its own, so switching between them moves nothing.
	const body = useRef<HTMLElement>(null);
	const handled = useRef<Handled>(nothingHandled());
	// An open Task's card grows out of its row, and shrinks back into the row
	// when closed, while the rest steps back. The rows below move with it, so
	// nothing else glides. This runs before the glides, so it can say so.
	const openShown = openId && rows.some(row => row.kind === 'task' && row.task.id === openId) ? openId : null;
	const away = (id?: string) => stepBack(openShown !== null && id !== openShown);
	const card = useRef<{id: string; copy: HTMLElement; rect: DOMRect; space: number} | null>(null);
	const rowHeights = useRef(new Map<string, number>());
	const rowOf = (id: string) => body.current?.querySelector<HTMLElement>(`[data-row="${id}"]`) ?? null;
	// Notes the open card as it is, at its full height even while it grows,
	// so closing can shrink it from there. A key or click can change the card
	// without the page drawing again, so it is noted then too.
	const noteCard = () => {
		const open = openShown && rowOf(openShown);
		if (!open || !openShown) return void (card.current = null);
		const {marginTop, marginBottom} = getComputedStyle(open);
		const {left, top, width} = open.getBoundingClientRect();
		const height = open.scrollHeight + open.offsetHeight - open.clientHeight;
		card.current = {id: openShown, copy: open.cloneNode(true) as HTMLElement, rect: new DOMRect(left, top, width, height), space: height + parseFloat(marginTop) + parseFloat(marginBottom)};
	};
	useEffect(() => {
		window.addEventListener('keydown', noteCard, true);
		window.addEventListener('pointerdown', noteCard, true);
		return () => {
			window.removeEventListener('keydown', noteCard, true);
			window.removeEventListener('pointerdown', noteCard, true);
		};
	});
	useLayoutEffect(() => {
		const was = card.current;
		noteCard();
		if ((was?.id ?? null) !== openShown) {
			handled.current.settled = true;
			const row = was && rowOf(was.id);
			if (was && row) {
				const to = row.getBoundingClientRect();
				const copy = pinned(was.copy, was.rect, 40);
				void copy.animate([{top: `${was.rect.top}px`, height: `${was.rect.height}px`, opacity: 1}, {top: `${to.top}px`, height: `${to.height}px`, opacity: 0}], {duration: ms, easing: ease})
					.finished.then(() => copy.remove());
				row.animate([{marginBottom: `${was.space - to.height}px`}, {marginBottom: '0px'}], {duration: ms, easing: ease});
			}
			const from = openShown && rowHeights.current.get(openShown);
			if (card.current && from) {
				const grown = rowOf(card.current.id)!;
				const {marginTop, marginBottom} = getComputedStyle(grown);
				grown.animate([{height: `${from}px`, marginTop: '0px', marginBottom: '0px', overflow: 'hidden'}, {height: `${card.current.rect.height}px`, marginTop, marginBottom, overflow: 'hidden'}], {duration: ms, easing: ease});
			}
		}
		rowHeights.current = new Map([...(body.current?.querySelectorAll<HTMLElement>('[data-task]') ?? [])].map(el => [el.dataset.task!, el.offsetHeight]));
	});
	useMotion(body, hash, view, handled);

	// Shows the changes at once, then saves them. Ending a Task or opening it
	// again keeps it in view, as it now is. A message offers Undo.
	const change = (patches: [string, TaskEdit][], message?: string, undoable = true) => {
		if (!patches.length) return;
		const mine = patches.filter(([id]) => known.current.has(id));
		if (undoable) undoes.current.push(mine.map(([id, patch]) => [id, reverseOf(known.current.get(id)!, patch)]));
		const updated = new Map(mine.map(([id, patch]) => [id, applied(known.current.get(id)!, patch)]));
		const swap = (t: Task) => updated.get(t.id) ?? t;
		setTasks(ts => ts.map(swap));
		setEnded(ts => ts.map(swap));
		setKept(k => {
			const next = new Map(k);
			for (const [id, patch] of mine) if (patch.ended !== undefined || k.has(id)) next.set(id, updated.get(id)!);
			return next;
		});
		// A Task I end greys at once and stays where it is for half a second,
		// so I see it done, before it glides to the bottom.
		const ending = view === 'logbook' ? [] : mine.flatMap(([id, patch]) => (patch.ended !== undefined && patch.ended !== 'not_ended' ? [id] : []));
		if (ending.length) {
			setStay(s => new Set([...s, ...ending]));
			setTimeout(() => setStay(s => new Set([...s].filter(id => !ending.includes(id)))), 500);
		}
		if (message) undoToast(message, undo);
		void Promise.all(patches.map(([id, patch]) => client.editTask(id, patch))).then(refresh, refresh);
	};

	const undo = () => {
		const last = undoes.current.pop();
		if (last) change(last, undefined, false);
	};

	const edit = (some: string[], patch: TaskEdit, message?: string) =>
		change(
			some.map(id => [id, patch]),
			message,
		);

	// Ticks the Tasks off, or opens them again when none is open.
	const tick = (some: string[]) => {
		const ending = some.some(id => known.current.get(id)?.ended === 'not_ended');
		edit(some, {ended: ending ? 'done' : 'not_ended'}, some.length > 1 ? `${ending ? 'Ticked off' : 'Opened again'} ${count(some.length)}` : undefined);
	};

	const drop = (some: string[]) => {
		const open = some.filter(id => known.current.get(id)?.ended === 'not_ended');
		if (!open.length) return;
		setOpenId(null);
		edit(open, {ended: 'dropped'}, `Dropped ${count(open.length)}`);
	};

	// Gives the Tasks a list or a Date, and says where they went when that
	// takes them out of view.
	const when = (some: string[], patch: TaskEdit) => {
		const first = known.current.get(some[0]!);
		const to = first && listOf(applied(first, patch), now);
		edit(some, patch, to && to !== view ? `Moved ${count(some.length)} to ${listNames[to]}` : undefined);
	};

	const deadline = (some: string[], given: Deadline) =>
		edit(some, {deadline: given}, some.length > 1 ? `${given.kind === 'by_day' ? 'Set a deadline on' : 'Cleared the deadline of'} ${count(some.length)}` : undefined);

	// Tasks move only among those of the same Thread, and the same project or
	// area, as they are grouped.
	const sameGroup = (a: string, b: string) => {
		const [one, other] = [known.current.get(a), known.current.get(b)];
		return !!one && !!other && one.threadId === other.threadId && sameBelongs(taskBelongs(one, threads), taskBelongs(other, threads));
	};
	// A page mixes Tasks from every list, so nothing is reordered there.
	const sortable = shown.kind === 'none' && reorderable(view);

	// Puts the moving Tasks, in the order shown, just before `before`, or at
	// the end. They take over the positions the list already uses, so Tasks
	// in other lists keep theirs.
	const reorder = (moving: string[], before: string | null) => {
		const rest = ids.filter(id => !moving.includes(id));
		const at = before ? rest.indexOf(before) : rest.length;
		const order = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
		const slots = shownTasks.map(t => t.position).sort((a, b) => a - b);
		change(order.flatMap((id, i): [string, TaskEdit][] => (known.current.get(id)!.position === slots[i] ? [] : [[id, {position: slots[i]!}]])));
	};

	// Moves the selected Tasks one place up or down.
	const nudge = (by: 1 | -1) => {
		if (!sortable || !chosen.length) return;
		const rest = ids.filter(id => !chosen.includes(id));
		if (!chosen.every(id => sameGroup(id, chosen[0]!))) return;
		if (by < 0) {
			const above = ids[ids.indexOf(chosen[0]!) - 1];
			if (above && sameGroup(above, chosen[0]!)) reorder(chosen, above);
		} else {
			const below = ids[ids.indexOf(chosen.at(-1)!) + 1];
			if (below && sameGroup(below, chosen[0]!)) reorder(chosen, rest[rest.indexOf(below) + 1] ?? null);
		}
	};

	const actions = (some: string[]): Actions => ({
		when: patch => when(some, patch),
		deadline: day => deadline(some, day),
		// A Task links to one Thread, project or area at most, so linking one
		// takes it out of the other.
		thread: id => edit(some, id ? {threadId: id, belongs: {kind: 'none'}} : {threadId: id}, some.length > 1 ? `${id ? 'Linked' : 'Unlinked'} ${count(some.length)}` : undefined),
		belongs: belongs =>
			edit(some, belongs.kind === 'none' ? {belongs} : {belongs, threadId: null}, some.length > 1 ? `${belongs.kind === 'none' ? 'Took' : 'Put'} ${count(some.length)} ${belongs.kind === 'none' ? 'out of their project or area' : `in ${belongingLabel(belongs, order)}`}` : undefined),
		tick: () => tick(some),
		drop: () => drop(some),
	});

	const rename = (task: Task, title: string | null) => {
		setRenaming(null);
		if (title === null || !title.trim() || title.trim() === task.title) return;
		edit([task.id], {title: title.trim()});
	};

	// Saves a new Task where its details put it, in one request, so it is
	// either added whole or not at all. Whatever it was typed into has
	// already closed, so a failure is said out loud.
	const addTask = async (draft: Draft) => {
		const {title} = draft;
		try {
			return await client.addTask(draft);
		} catch {
			toast(`Could not add "${title}"`);
		} finally {
			await refresh();
		}
	};

	// A new Task starts where I am: in this list, or tomorrow in Upcoming,
	// which needs a Date ahead.
	const add = async (draft: Draft | null) => {
		setAdding(false);
		if (!draft) return;
		const task = await addTask(draft);
		if (!task) return;
		setSelected([task.id]);
		setAnchor(task.id);
	};
	const startDraft = (): Draft => ({
		title: '',
		notes: '',
		when: view === 'upcoming' ? {kind: 'on_day', day: addDays(today(), 1)} : {kind: view === 'logbook' || view === 'threads' ? 'anytime' : view},
		deadline: {kind: 'none'},
		threadId: null,
		belongs: shown,
	});

	// A click selects one Task, Cmd-click adds or removes one, and
	// Shift-click selects the run from the last one clicked.
	const select = (id: string, e: {metaKey: boolean; ctrlKey: boolean; shiftKey: boolean}) => {
		if (phone && !picking) {
			setSelected([id]);
			setOpenId(id);
			return;
		}
		if (picking || e.metaKey || e.ctrlKey) {
			setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
			setAnchor(id);
		} else if (e.shiftKey && anchor && ids.includes(anchor)) {
			const [a, b] = [ids.indexOf(anchor), ids.indexOf(id)].sort((x, y) => x - y);
			setSelected(ids.slice(a, b! + 1));
		} else {
			setSelected([id]);
			setAnchor(id);
		}
		if (openId !== id) setOpenId(null);
	};

	const step = (by: number, extend: boolean) => {
		if (!ids.length) return;
		const from = chosen.length ? ids.indexOf(chosen[by > 0 ? chosen.length - 1 : 0]!) : by > 0 ? -1 : ids.length;
		const next = ids[Math.min(ids.length - 1, Math.max(0, from + by))]!;
		if (extend) setSelected(s => (s.includes(next) ? s : [...s, next]));
		else {
			setSelected([next]);
			setAnchor(next);
		}
		document.querySelector(`[data-task="${next}"]`)?.scrollIntoView({block: 'nearest'});
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.altKey && e.code === 'KeyC') {
				e.preventDefault();
				setCapturing(true);
				return;
			}
			if (capturing || (e.target as HTMLElement).closest('input, textarea, [role=dialog], [role=menu]')) return;
			// The Threads page has keys of its own; only Tab moves between views.
			if (view === 'threads' && e.key !== 'Tab') return;
			if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
				e.preventDefault();
				undo();
				return;
			}
			if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
				e.preventDefault();
				setSelected(ids);
				return;
			}
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const one = chosen.length === 1 ? chosen[0] : undefined;
			// Shift with a letter can arrive in either case, so it is read as upper case.
			const key = e.shiftKey && e.key.length === 1 ? e.key.toUpperCase() : e.key;
			if (key === 'ArrowDown' || key === 'j') step(1, e.shiftKey);
			else if (key === 'ArrowUp' || key === 'k') step(-1, e.shiftKey);
			else if (key === 'J') nudge(1);
			else if (key === 'K') nudge(-1);
			else if (key === 'Enter' && chosen.length) tick(chosen);
			else if (key === 'r' && one) setRenaming(one);
			else if (key === ' ' && one) setOpenId(o => (o ? null : one));
			else if ((key === 'Backspace' || key === 'Delete') && chosen.length) drop(chosen);
			else if (key === 'a') {
				if (view === 'logbook') setCapturing(true);
				else setAdding(true);
			} else if (key === 'Tab') setView(views[(views.indexOf(view) + (e.shiftKey ? views.length - 1 : 1)) % views.length]!);
			else if (key === 'Escape') {
				if (openId) setOpenId(null);
				else setSelected([]);
			} else return;
			e.preventDefault();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const sensors = useSensors(
		useSensor(PointerSensor, {activationConstraint: {distance: 6}}),
		useSensor(TouchSensor, {activationConstraint: {delay: 300, tolerance: 8}}),
	);
	const dragOn = useRef(false);
	dragOn.current = dragging.length > 0 || sidebarDrag.kind !== 'none';
	const [escape] = useState(() => dragEscape(() => dragOn.current));
	useEffect(() => {
		window.addEventListener('keydown', escape.watch, true);
		return () => window.removeEventListener('keydown', escape.watch, true);
	}, [escape]);
	// A project lands among the projects and area rows, and an area among
	// the areas. For a Task, over the sidebar the list under the pointer
	// wins; within the list, the nearest row.
	const collisions: CollisionDetection = args => {
		const dragged = sortableOf(String(args.active.id)).kind;
		const among = (keep: (kind: ReturnType<typeof sortableOf>['kind']) => boolean) =>
			args.droppableContainers.filter(c => keep(sortableOf(String(c.id)).kind));
		if (dragged === 'project') return closestCenter({...args, droppableContainers: among(kind => kind === 'project' || kind === 'head')});
		if (dragged === 'area') return closestCenter({...args, droppableContainers: among(kind => kind === 'area')});
		const tasks = among(kind => kind === 'other');
		const lists = pointerWithin({...args, droppableContainers: tasks.filter(c => String(c.id).startsWith('list:'))});
		return lists.length ? lists : closestCenter({...args, droppableContainers: tasks});
	};
	const sidebar = sidebarRows(projects, areas);
	// A plain click opens a project or area. On a project, cmd-click adds or
	// takes it away from those picked, and shift-click picks every project
	// from the one last clicked to this one.
	const clickPage = (page: Page, e: {metaKey: boolean; ctrlKey: boolean; shiftKey: boolean}) => {
		const from = pickedFrom.current;
		if (page.kind === 'project' && (e.metaKey || e.ctrlKey)) {
			const start = picked.length ? picked : from ? [from] : [];
			setPicked(start.includes(page.id) ? start.filter(id => id !== page.id) : [...start, page.id]);
			pickedFrom.current = page.id;
			return;
		}
		const order = sidebar.flatMap(row => (row.kind === 'project' ? [row.id] : []));
		if (page.kind === 'project' && e.shiftKey && from && order.includes(from)) {
			const [a, b] = [order.indexOf(from), order.indexOf(page.id)].sort((x, y) => x - y);
			setPicked(order.slice(a, b + 1));
			return;
		}
		setPicked([]);
		pickedFrom.current = page.kind === 'project' ? page.id : null;
		openPage(page);
	};
	const dropInSidebar = (activeId: string, overId: string) => {
		const [dragged, over] = [sortableOf(activeId), sortableOf(overId)];
		if (sidebarDrag.kind === 'projects' && dragged.kind === 'project' && (over.kind === 'project' || over.kind === 'head')) {
			const target = {kind: over.kind === 'head' ? 'area' : 'project', id: over.id} as const;
			const changed = projectsDropped(sidebar, projects, sidebarDrag.ids, dragged.id, target);
			const byId = new Map(changed.map(c => [c.id, c]));
			setProjects(ps => ps.map(p => {
				const c = byId.get(p.id);
				return c ? {...p, area: c.area, position: c.position} : p;
			}));
			void Promise.all(changed.map(c => client.editProject(c.id, {area: c.area, position: c.position}))).then(refresh, refresh);
		} else if (sidebarDrag.kind === 'area' && over.kind === 'area') {
			const changed = new Map(areaDropped(areas, sidebarDrag.id, over.id).map(c => [c.id, c.position]));
			setAreas(as => as.map(a => (changed.has(a.id) ? {...a, position: changed.get(a.id)!} : a)));
			void Promise.all([...changed].map(([id, position]) => client.editArea(id, {position}))).then(refresh, refresh);
		}
	};
	const onDragStart = ({active}: DragStartEvent) => {
		const id = String(active.id);
		const dragged = sortableOf(id);
		// Dragging a picked project takes all those picked with it.
		if (dragged.kind === 'project') return setSidebarDrag({kind: 'projects', ids: picked.includes(dragged.id) ? [dragged.id, ...picked.filter(other => other !== dragged.id)] : [dragged.id]});
		if (dragged.kind === 'area') return setSidebarDrag({kind: 'area', id: dragged.id});
		// Dragging a selected Task takes the whole selection with it.
		setDragging(chosen.includes(id) ? chosen : [id]);
		if (!chosen.includes(id)) setSelected([id]);
		setOpenId(null);
	};
	const onDragEnd = ({active, over}: DragEndEvent) => {
		if (sidebarDrag.kind !== 'none') {
			if (over) dropInSidebar(String(active.id), String(over.id));
			return setSidebarDrag({kind: 'none'});
		}
		const moving = dragging;
		setDragging([]);
		if (!over) return;
		const target = String(over.id);
		if (target.startsWith('list:')) {
			const to = target.slice('list:'.length) as View;
			if (to === 'logbook') edit(moving, {ended: 'done'}, `Ticked off ${count(moving.length)}`);
			else when(moving, {when: {kind: to as Place}});
			return;
		}
		if (!sortable || moving.includes(target) || !moving.every(id => sameGroup(id, target))) return;
		// The drag has already put every row where it goes.
		handled.current.settled = true;
		const down = ids.indexOf(target) > ids.indexOf(String(active.id));
		const rest = ids.filter(id => !moving.includes(id));
		reorder(moving, down ? (rest[rest.indexOf(target) + 1] ?? null) : target);
	};
	const lifted = dragging.length ? known.current.get(dragging[0]!) : undefined;

	// Shows a change to a Thread at once, then saves it.
	const editThread = (id: string, edit: MyEdit) => {
		setThreads(ts => ts.map(t => (t.id === id ? {...t, ...edit} : t)));
		void client.edit(id, edit).then(refresh, refresh);
	};

	const createThread = async (title: string, parentId: string | null, afterId: string | null) => {
		try {
			return await client.create(title, parentId, afterId);
		} catch {
			toast(`Could not add "${title}"`);
		} finally {
			await refresh();
		}
	};

	// Shows a move at once, then makes it.
	const moveThread = (id: string, parentId: string | null, index: number) => {
		setThreads(ts => moved(ts, id, parentId, index));
		void client.move(id, parentId, index).then(refresh, refresh);
	};

	// The Task becomes the Thread and leaves the list at once. A message says
	// so and offers to show the Thread.
	const turnIntoThread = async (task: Task, parentId: string | null) => {
		setOpenId(null);
		setTasks(ts => ts.filter(t => t.id !== task.id));
		try {
			const thread = await client.turnIntoThread(task.id, parentId);
			setThreads(ts => [...ts, thread]);
			toast(`Turned "${task.title}" into a Thread`, {action: {label: 'Show', onClick: () => showThread(thread.id)}});
		} catch {
			toast(`Could not turn "${task.title}" into a Thread`);
		}
		await refresh();
	};

	const showThread = (id: string) => {
		setView('threads');
		setThreadId(id);
	};

	// A page takes the place of a list, and going back to a list closes it.
	const openPage = (page: Page) => {
		setView(view === 'threads' || view === 'logbook' ? 'anytime' : view);
		setShown(page);
	};

	// Shows a change to a project or area at once, then saves it.
	const editProject = (id: string, edit: ProjectEdit) => {
		setProjects(ps => ps.map(p => (p.id === id ? {...p, ...edit} : p)));
		void client.editProject(id, edit).then(refresh, refresh);
	};
	const editArea = (id: string, edit: AreaEdit) => {
		setAreas(as => as.map(a => (a.id === id ? {...a, ...edit} : a)));
		void client.editArea(id, edit).then(refresh, refresh);
	};
	const endedAs = (page: Page, how: 'done' | 'dropped' | 'not_ended') =>
		page.kind === 'project' ? editProject(page.id, {ended: how}) : editArea(page.id, {ended: how === 'done' ? 'dropped' : how});
	const titleOf = (page: Page) => (page.kind === 'project' ? projects : areas).find(one => one.id === page.id)?.title ?? '';

	// The open projects, Threads and Tasks inside a project or area, which
	// ending it leaves as they are.
	const openInside = (page: Page): string[] => {
		const inProjects = page.kind === 'area' ? projects.filter(p => p.ended === 'not_ended' && p.area.kind === 'in' && p.area.id === page.id) : [];
		const homes: Belongs[] = [page, ...inProjects.map(p => ({kind: 'project' as const, id: p.id}))];
		const inside = (belongs: Belongs) => homes.some(home => sameBelongs(home, belongs));
		return [
			...inProjects.map(p => p.title),
			...threads.filter(t => t.ended === 'not_ended' && inside(threadBelongs(t, threads))).map(t => t.title),
			...tasks.filter(t => t.ended === 'not_ended' && inside(taskBelongs(t, threads))).map(t => t.title),
		];
	};
	const finishEnding = (page: Page, how: 'done' | 'dropped') => {
		setEnding(null);
		endedAs(page, how);
		undoToast(`${how === 'done' ? 'Marked' : 'Dropped'} "${titleOf(page)}"${how === 'done' ? ' Done' : ''}`, () => endedAs(page, 'not_ended'));
	};
	// Asks first when something inside is still open. Opening it again needs
	// no asking.
	const endPage = (page: Page, how: 'done' | 'dropped' | 'not_ended') => {
		if (how === 'not_ended') return endedAs(page, how);
		const open = openInside(page);
		if (open.length) setEnding({page, how, open});
		else finishEnding(page, how);
	};

	const createPage = async (kind: Page['kind'], title: string | null) => {
		setNaming(null);
		if (!title) return;
		try {
			const made = kind === 'project' ? await client.createProject({title}) : await client.createArea({title});
			await refresh();
			openPage({kind, id: made.id});
		} catch {
			toast(`Could not add "${title}"`);
		}
	};

	const [Icon, colour] = icons[view];
	// No list is picked in the sidebar while a page is open.
	const current: View | 'page' = shown.kind !== 'none' ? 'page' : view;
	const isShown = (kind: Page['kind'], id: string) => shown.kind === kind && shown.id === id;
	// The bar takes the place of the + button, which a phone has no room for beside it.
	const bar = view !== 'logbook' && (chosen.length > 1 || (picking && chosen.length > 0));

	return (
		<TooltipProvider>
			<DndContext sensors={sensors} collisionDetection={collisions} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => {
				setDragging([]);
				setSidebarDrag({kind: 'none'});
			}}>
				<SidebarProvider>
					<Sidebar escapeEndsDrag={escape.endsDrag}>
						<SidebarHeader className="px-4 pt-5" style={away()}>
							<span className="shimmer font-mono text-lg font-bold tracking-tight">todos</span>
						</SidebarHeader>
						<SidebarContent style={away()}>
							<SidebarGroup>
								<SidebarMenu>
									<ViewItem view="inbox" current={current} count={counts.inbox} onPick={setView} />
								</SidebarMenu>
							</SidebarGroup>
							<SidebarGroup>
								<SidebarMenu>
									{lists.filter(v => v !== 'inbox').map(v => (
										<ViewItem key={v} view={v} current={current} count={counts[v]} onPick={setView} />
									))}
								</SidebarMenu>
							</SidebarGroup>
							<SidebarGroup>
								<SidebarMenu>
									<ViewItem view="logbook" current={current} count={0} onPick={setView} />
								</SidebarMenu>
							</SidebarGroup>
							<SidebarGroup>
								<SidebarMenu>
									<ViewItem view="threads" current={current} count={0} onPick={setView} />
								</SidebarMenu>
							</SidebarGroup>
							{/* Sets the projects and areas apart from the lists and Threads above. */}
							<SidebarSeparator className="mx-4" />
							{/* Every project and area row makes room as a project is dragged
							    past, so each group lists all of them; the areas make room for
							    an area. */}
							<SortableContext items={sidebar.map(row => sortableId(row.kind === 'area' ? 'head' : 'project', row.id))} strategy={verticalListSortingStrategy}>
								<SidebarGroup>
									<SidebarMenu>
										{projects.filter(p => p.area.kind === 'none' && p.ended === 'not_ended').sort(byPosition).map(p => (
											<PageItem key={p.id} page={{kind: 'project', id: p.id}} title={p.title} deadline={p.deadline} active={isShown('project', p.id)} picked={picked.includes(p.id)} onClick={clickPage} />
										))}
									</SidebarMenu>
								</SidebarGroup>
							</SortableContext>
							<SortableContext items={areas.filter(a => a.ended === 'not_ended').sort(byPosition).map(a => sortableId('area', a.id))} strategy={verticalListSortingStrategy}>
								{areas.filter(a => a.ended === 'not_ended').sort(byPosition).map(a => (
									<AreaGroup key={a.id} id={a.id}>
										{handle => (
											<SortableContext items={sidebar.map(row => sortableId(row.kind === 'area' ? 'head' : 'project', row.id))} strategy={verticalListSortingStrategy}>
												<PageItem page={{kind: 'area', id: a.id}} title={a.title} active={isShown('area', a.id)} onClick={clickPage} handle={handle} />
												{projects.filter(p => p.area.kind === 'in' && p.area.id === a.id && p.ended === 'not_ended').sort(byPosition).map(p => (
													<PageItem key={p.id} page={{kind: 'project', id: p.id}} title={p.title} deadline={p.deadline} active={isShown('project', p.id)} picked={picked.includes(p.id)} onClick={clickPage} />
												))}
											</SortableContext>
										)}
									</AreaGroup>
								))}
							</SortableContext>
							<SidebarGroup>
								<SidebarMenu>
									<SidebarMenuItem>
										<DropdownMenu>
											<DropdownMenuTrigger render={<SidebarMenuButton className="text-muted-foreground" />}>
												<PlusIcon />
												<span>New</span>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="start">
												<DropdownMenuItem onClick={() => setNaming('project')}>Project</DropdownMenuItem>
												<DropdownMenuItem onClick={() => setNaming('area')}>Area</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</SidebarMenuItem>
								</SidebarMenu>
							</SidebarGroup>
						</SidebarContent>
					</Sidebar>
					<SidebarInset className={cn(view === 'threads' && 'h-svh')}>
						<header className="flex items-center justify-between px-3 pt-3 md:hidden">
							<SidebarTrigger />
							{view !== 'logbook' && view !== 'threads' && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setPicking(p => !p);
										setSelected([]);
										setOpenId(null);
									}}
								>
									{picking ? 'Done' : 'Select'}
								</Button>
							)}
						</header>
						{view === 'threads' ? (
							<ThreadsPage threads={threads} tasks={tasks} selectedId={threadId} onSelect={setThreadId} opened={opened} onOpened={setOpened} onTick={id => tick([id])} onEdit={editThread} onCreate={createThread} onMove={moveThread} onAddTask={draft => void addTask(draft)} order={order} />
						) : (
							<main
								ref={body}
								className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-4 pb-32 md:px-12 md:pt-14"
								onClick={e => e.target === e.currentTarget && setSelected([])}
							>
								{shown.kind !== 'none' ? (
									<div style={away()}><PageTop page={shown} areas={areas} projects={projects} onOpen={openPage} onEditProject={editProject} onEditArea={editArea} onEnd={how => endPage(shown, how)} /></div>
								) : (
									<h1 style={away()} className="mb-6 flex items-center gap-3 font-heading text-2xl font-semibold tracking-tight">
										<Icon className="size-[0.9em]" style={{color: colour}} />
										{viewNames[view]}
									</h1>
								)}
								{rows.length === 0 && !adding && (
									<p className="mt-16 text-center text-sm text-muted-foreground">
										{shown.kind !== 'none' ? 'Nothing in it yet.' : view === 'inbox' ? 'Nothing to sort. Alt+C captures a task.' : 'Nothing here.'}
									</p>
								)}
								{/* The Logbook only opens Tasks again, so it has no menu or bar. On a
								phone a long press drags, so there is no menu there either. */}
								<ContextMenu disabled={view === 'logbook' || phone}>
									<ContextMenuTrigger data-column="list" className="flex flex-col">
										<SortableContext items={ids} strategy={verticalListSortingStrategy}>
											{rows.map(row =>
												row.kind === 'header' ? (
													<h2 key={`h-${row.label}`} data-row={`h-${row.label}`} style={away()} className="mt-10 mb-1 border-b pb-1.5 text-base font-semibold first:mt-0">
														{row.label}
													</h2>
												) : row.kind === 'belonging' ? (
													<BelongingHeading key={`b-${belongsKey(row.belonging.belongs)}`} row={`b-${belongsKey(row.belonging.belongs)}`} style={away()} belonging={row.belonging} onOpen={openPage} />
												) : row.kind === 'thread' ? (
													<h2
														key={`t-${row.thread.id}`}
														data-row={`t-${row.thread.id}`}
														style={away()}
														className={cn(
															'mb-1 text-sm font-semibold first:mt-0',
															// Under a day the day's heading sets the group apart, so a Thread's
															// heading has no rule and sits closer when straight under it.
															inUpcoming ? 'mt-6 [h2+&]:mt-3' : row.nested || shown.kind !== 'none' ? 'mt-4' : 'mt-6 border-b pb-1',
														)}
													>
														<button className="group flex items-center gap-2 hover:text-(--icon-bright)" onClick={() => showThread(row.thread.id)}>
															<StateDot shown={shownMove(row.thread)} dimmed={!isActive(row.thread, today())} />
															<span className={cn(shownMove(row.thread) === 'working' && 'shimmer')}>{row.thread.title}</span>
															{row.thread.when.kind === 'someday' && row.thread.ended === 'not_ended' && !inUpcoming && <span className="text-xs font-normal text-muted-foreground">someday</span>}
															<ChevronRightIcon className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
														</button>
													</h2>
												) : openId === row.task.id ? (
													<TaskDetail
														key={row.task.id}
														task={row.task}
														threads={threads}
														order={order}
														onTurnIntoThread={parentId => void turnIntoThread(row.task, parentId)}
														onEdit={patch =>
															patch.when !== undefined ? when([row.task.id], patch) : edit([row.task.id], patch)
														}
														onTick={() => tick([row.task.id])}
														onDrop={() => drop([row.task.id])}
														onClose={() => setOpenId(null)}
													/>
												) : (
													<TaskRow
														key={row.task.id}
														task={row.task}
														view={shown.kind !== 'none' ? 'page' : view}
														away={away(row.task.id)}
														dimmed={(view !== 'logbook' && row.task.ended !== 'not_ended') || (dragging.includes(row.task.id) && dragging[0] !== row.task.id)}
														selected={chosen.includes(row.task.id)}
														renaming={renaming === row.task.id}
														draggable={view !== 'logbook'}
														sortable={sortable}
														onSelect={e => select(row.task.id, e)}
														onOpen={() => setOpenId(row.task.id)}
														onTick={() => tick([row.task.id])}
														onRename={title => rename(row.task, title)}
													/>
												),
											)}
										</SortableContext>
										{adding && <NewTask start={startDraft()} threads={threads} onDone={draft => void add(draft)} />}
									</ContextMenuTrigger>
									{chosen.length > 0 && <TaskMenu actions={actions(chosen)} threads={threads} order={order} />}
								</ContextMenu>
							</main>
						)}
						{!bar && view !== 'threads' && (
							<Button
								size="icon-lg"
								style={away()}
								className="fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] rounded-full shadow-lg"
								onClick={() => (view === 'logbook' ? setCapturing(true) : setAdding(true))}
								aria-label="New task"
							>
								<PlusIcon />
							</Button>
						)}
						{bar && <SelectionBar count={chosen.length} actions={actions(chosen)} threads={threads} order={order} onClear={() => setSelected([])} />}
					</SidebarInset>
				</SidebarProvider>
				<DragOverlay>
					{sidebarDrag.kind !== 'none' && (
						<div className="flex items-center gap-2 rounded-md border bg-sidebar px-2 py-1.5 text-sm shadow-xl">
							<span className={cn(sidebarDrag.kind === 'area' && 'font-semibold')}>
								{sidebarDrag.kind === 'area' ? areas.find(a => a.id === sidebarDrag.id)?.title : projects.find(p => p.id === sidebarDrag.ids[0])?.title}
							</span>
							{sidebarDrag.kind === 'projects' && sidebarDrag.ids.length > 1 && (
								<span className="rounded-full bg-primary px-2 text-xs text-primary-foreground tabular-nums">{sidebarDrag.ids.length}</span>
							)}
						</div>
					)}
					{lifted && (
						<div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 shadow-xl">
							<Checkbox disabled aria-hidden />
							<span className={titleClass}>{lifted.title}</span>
							{dragging.length > 1 && (
								<span className="rounded-full bg-primary px-2 text-xs text-primary-foreground tabular-nums">{dragging.length}</span>
							)}
						</div>
					)}
				</DragOverlay>
			</DndContext>
			<ConfirmEnd
				ending={ending && {title: titleOf(ending.page), how: ending.how, open: ending.open}}
				onCancel={() => setEnding(null)}
				onConfirm={() => ending && finishEnding(ending.page, ending.how)}
			/>
			<NewPage kind={naming} onDone={title => naming && void createPage(naming, title)} />
			<Capture open={capturing} onOpenChange={setCapturing} onSave={title => void addTask({title, notes: '', when: {kind: 'inbox'}, deadline: {kind: 'none'}, threadId: null, belongs: {kind: 'none'}})} />
			{/* Raised so a message never covers the bar at the bottom. */}
			<Toaster position="bottom-center" offset={88} mobileOffset={{bottom: 'calc(88px + env(safe-area-inset-bottom))'}} />
		</TooltipProvider>
	);
}
