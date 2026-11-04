import {Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {closestCenter, DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent} from '@dnd-kit/core';
import {SortableContext, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {ArchiveIcon, BookCheckIcon, BoxIcon, CalendarIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, FolderInputIcon, MaximizeIcon, NetworkIcon, PlusIcon, RotateCcwIcon, XIcon, type LucideIcon} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {Calendar} from '@/components/ui/calendar';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog, DialogContent, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {Textarea} from '@/components/ui/textarea';
import {useIsMobile} from '@/hooks/use-mobile';
import {dayOf, listNames, listOf, type Task} from '../../src/core/task';
import type {Belonging} from '../../src/core/project';
import {belongingLabel, BelongsPicker} from './Pages';
import {ancestorsOf, childrenOf, descendantsOf, isActive, shownMove, treeRows, type Thread, type TreeRow, type View, type When} from '../../src/core/thread';
import type {MyEdit} from '../../src/core/threads';
import {columnsFor} from './columns';
import {Deadline} from './Deadline';
import {NewTask, type Draft} from './NewTask';
import {StateDot} from './StateDot';
import {Formatted} from './Formatted';
import {ease, fly, ms, nothingHandled, pinned, stepBack, useMotion, type Handled} from './motion';
import {ThreadPicker} from './ThreadPicker';
import {bareInput, titleClass} from './TaskRow';
import {dayName, today} from './days';
import {moveName, whenName} from '../../src/core/words';

type PageView = Exclude<View, 'all'>;
// Where Esc on a new top-level Thread goes: nowhere, or back into the
// Thread it was asked for from, on its own page or not.
type Back = {kind: 'stay'} | {kind: 'thread'; id: string; ownPage: boolean};
// Where I asked for a new Thread: with a key, or with the Child Thread
// button, which the new row comes from and goes back to on Esc.
type AskedFrom = {kind: 'key'} | {kind: 'button'; at: DOMRect};

const viewTitle: Record<PageView, [string, LucideIcon]> = {active: ['Active', NetworkIcon], bring_in: ['Bring in', ArchiveIcon], ended: ['Ended', BookCheckIcon]};

// Beside a title: Someday or the day it comes back while I look at what I
// could bring in, how it ended, and its Deadline while open, as on Home.
function Tags({thread, view}: {thread: Thread; view: PageView}) {
	return (
		<>
			{view === 'bring_in' && thread.ended === 'not_ended' && !isActive(thread, today()) && (
				<span className="shrink-0 text-xs text-muted-foreground">{thread.when.kind === 'on_day' ? `↻ ${dayName(thread.when.day)}` : 'someday'}</span>
			)}
			{thread.ended !== 'not_ended' && <span className="shrink-0 text-xs text-muted-foreground">{thread.ended}</span>}
			{thread.deadline.kind === 'by_day' && thread.ended === 'not_ended' && <Deadline day={thread.deadline.day} />}
		</>
	);
}

// The Task open in place of its row. The lists and the Threads page share
// it, so an open Task works and closes the same way everywhere.
export type OpenTask = {id: string | null; open: (id: string) => void; detail: (task: Task) => ReactNode};

// A Thread's open linked Tasks, which can be ticked off as in any list,
// opened with a click or a tap, and a way to add one. One ticked here stays, struck through, until another
// Thread is picked, so a second click opens it again.
function LinkedTasks({
	thread,
	threads,
	tasks,
	onTick,
	onAdd,
	openTask,
}: {
	thread: Thread;
	threads: Thread[];
	tasks: Task[];
	onTick: (id: string) => void;
	onAdd: (draft: Draft) => void;
	openTask: OpenTask;
}) {
	const [ticked, setTicked] = useState<Map<string, Task>>(new Map());
	const [adding, setAdding] = useState(false);
	const shown = [...tasks.filter(t => (t.ended === 'not_ended' || t.id === openTask.id) && !ticked.has(t.id)), ...ticked.values()].sort((a, b) => a.position - b.position);
	return (
		<section className="flex flex-col">
			<h3 className="mb-1 text-xs font-medium text-muted-foreground">Tasks</h3>
			{shown.map(task => {
				const done = ticked.has(task.id);
				if (openTask.id === task.id) return <Fragment key={task.id}>{openTask.detail(task)}</Fragment>;
				return (
					<div key={task.id} data-task={task.id} className="flex cursor-default items-center gap-3 py-1.5" onClick={e => !(e.target as Element).closest('button') && openTask.open(task.id)}>
						<Checkbox
							checked={done}
							onCheckedChange={() => {
								onTick(task.id);
								setTicked(m => {
									const next = new Map(m);
									if (done) next.delete(task.id);
									else next.set(task.id, task);
									return next;
								});
							}}
							aria-label="Done"
						/>
						<span className={cn(titleClass, 'min-w-0 flex-1 truncate', done && 'text-muted-foreground line-through')}>{task.title}</span>
						<span className="shrink-0 text-xs text-muted-foreground">{listNames[listOf(task, today())]}</span>
					</div>
				);
			})}
			{/* A Task added inside a Thread is already clarified, so it starts
			in Anytime rather than the Inbox, linked to the Thread. */}
			{adding ? (
				<NewTask
					start={{title: '', notes: '', when: {kind: 'anytime'}, deadline: {kind: 'none'}, threadId: thread.id, belongs: {kind: 'none'}}}
					threads={threads}
					onDone={draft => {
						setAdding(false);
						if (draft) onAdd(draft);
					}}
				/>
			) : (
				<Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={() => setAdding(true)}>
					<PlusIcon data-icon="inline-start" />
					Task
				</Button>
			)}
		</section>
	);
}

// Text edited in place, saved when it loses focus. Enter ends a one-line
// field, and Esc puts the text back. While I edit it, a change from
// elsewhere, such as the Session updating the Thread, waits until I leave
// the field, so it never replaces what I am typing. A required field left
// empty saves nothing and shows the saved text again.
export function Field({
	value,
	placeholder,
	multiline,
	required,
	className,
	onSave,
}: {
	value: string;
	placeholder: string;
	multiline?: boolean;
	required?: boolean;
	className?: string;
	onSave: (value: string) => void;
}) {
	const [text, setText] = useState(value);
	// Multi-line text shows its Markdown formatted until it is clicked.
	const [editing, setEditing] = useState(false);
	// The text when editing began, or null when the field is not being edited.
	const from = useRef<string | null>(null);
	useEffect(() => {
		if (from.current === null) setText(value);
	}, [value]);
	const props = {
		value: text,
		placeholder,
		onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(e.target.value),
		onFocus: () => {
			from.current = text;
		},
		onBlur: () => {
			setEditing(false);
			const started = from.current;
			from.current = null;
			if (started === null) return;
			// Unchanged, so take any newer value that arrived while it had focus.
			if (text === started || (required && !text.trim())) setText(value);
			else onSave(text);
		},
		onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			if (e.key === 'Escape') {
				from.current = null;
				setText(value);
				e.currentTarget.blur();
			}
			if (e.key === 'Enter' && !multiline) e.currentTarget.blur();
		},
	};
	if (multiline && !editing) return <Formatted text={text} placeholder={placeholder} onEdit={() => setEditing(true)} />;
	return multiline ? (
		<Textarea {...props} autoFocus className={cn(bareInput, 'min-h-6 resize-none text-sm md:text-sm', className)} />
	) : (
		<Input {...props} className={cn(bareInput, 'text-sm md:text-sm', className)} />
	);
}

function Details({
	thread,
	tasks,
	onTick,
	onEdit,
	onAddChild,
	onWhen,
	onEnd,
	threads,
	onMoveTo,
	onAddTask,
	order,
	onOpen,
	childThreads,
	openTask,
}: {
	openTask: OpenTask;
	onAddTask: (draft: Draft) => void;
	order: Belonging[];
	onOpen?: () => void;
	childThreads?: ReactNode;
	thread: Thread;
	threads: Thread[];
	onMoveTo: (parentId: string | null) => void;
	tasks: Task[];
	onTick: (id: string) => void;
	onEdit: (edit: MyEdit) => void;
	// Where the Child Thread button is, so the new row can come from it.
	onAddChild: (from: DOMRect) => void;
	onWhen: (when: When) => void;
	onEnd: (how: 'done' | 'dropped') => void;
}) {
	const [notesOpen, setNotesOpen] = useState(false);
	const [open, setOpen] = useState<'move' | 'when' | 'deadline' | 'moveTo' | 'belongs' | null>(null);
	const opener = (which: NonNullable<typeof open>) => (isOpen: boolean) => setOpen(isOpen ? which : null);
	const pick = (run: () => void) => {
		setOpen(null);
		run();
	};
	const shown = shownMove(thread);
	const working = shown === 'working';
	const ended = thread.ended !== 'not_ended';
	return (
		<div className="flex flex-col gap-4">
			<Field
				value={thread.title}
				placeholder="Title"
				className={cn('font-heading text-xl font-semibold tracking-tight md:text-xl', working && 'shimmer')}
				required
				onSave={title => onEdit({title: title.trim()})}
			/>
			<div className="-ml-2 flex flex-wrap items-center gap-1">
				{ended ? (
					<Button variant="ghost" size="sm" onClick={() => onEnd(thread.ended as 'done' | 'dropped')}>
						<RotateCcwIcon data-icon="inline-start" />
						{thread.ended === 'done' ? 'Done' : 'Dropped'} · reopen
					</Button>
				) : (
					<>
						{/* Whose move: On me or Waiting. Working is shown, never set. */}
						<Popover open={open === 'move'} onOpenChange={opener('move')}>
							<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
								<StateDot shown={shown} />
								<span className={cn(working && 'shimmer')}>{moveName[shown]}</span>
							</PopoverTrigger>
							<PopoverContent className="w-40 p-1" align="start">
								{(['on_me', 'waiting'] as const).map(move => (
									<Button key={move} variant="ghost" className="justify-start" onClick={() => pick(() => onEdit({whoseMove: move}))}>
										{moveName[move]}
										{thread.whoseMove === move && <CheckIcon className="ml-auto" />}
									</Button>
								))}
							</PopoverContent>
						</Popover>
						{/* When: Active, Someday, or a day it comes back. */}
						<Popover open={open === 'when'} onOpenChange={opener('when')}>
							<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
								{whenName(thread.when, today()) === 'Active' ? <NetworkIcon data-icon="inline-start" /> : thread.when.kind === 'someday' ? <ArchiveIcon data-icon="inline-start" /> : <CalendarIcon data-icon="inline-start" />}
								{whenName(thread.when, today())}
							</PopoverTrigger>
							<PopoverContent className="w-auto p-1" align="start">
								<Button variant="ghost" className="w-full justify-start" onClick={() => pick(() => onWhen({kind: 'active'}))}>
									<NetworkIcon data-icon="inline-start" />
									Active
								</Button>
								<Button variant="ghost" className="w-full justify-start" onClick={() => pick(() => onWhen({kind: 'someday'}))}>
									<ArchiveIcon data-icon="inline-start" />
									Someday
								</Button>
								<p className="px-2 pt-2 text-xs font-medium text-muted-foreground">Bring it back on</p>
								<Calendar
									mode="single"
									weekStartsOn={1}
									selected={thread.when.kind === 'on_day' ? new Date(`${thread.when.day}T12:00`) : undefined}
									onSelect={day => day && pick(() => onWhen({kind: 'on_day', day: dayOf(day)}))}
								/>
							</PopoverContent>
						</Popover>
						<Popover open={open === 'deadline'} onOpenChange={opener('deadline')}>
							<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
								{thread.deadline.kind === 'by_day' ? <Deadline day={thread.deadline.day} /> : 'Deadline'}
							</PopoverTrigger>
							<PopoverContent className="w-auto p-1" align="start">
								<Calendar
									mode="single"
									weekStartsOn={1}
									selected={thread.deadline.kind === 'by_day' ? new Date(`${thread.deadline.day}T12:00`) : undefined}
									onSelect={day => day && pick(() => onEdit({deadline: {kind: 'by_day', day: dayOf(day)}}))}
								/>
								{thread.deadline.kind === 'by_day' && (
									<Button variant="ghost" className="w-full justify-start" onClick={() => pick(() => onEdit({deadline: {kind: 'none'}}))}>
										Clear deadline
									</Button>
								)}
							</PopoverContent>
						</Popover>
						<Button variant="ghost" size="sm" onClick={() => onEnd('done')}>
							<CheckIcon data-icon="inline-start" />
							Done
						</Button>
						<Button variant="ghost" size="sm" onClick={() => onEnd('dropped')}>
							<XIcon data-icon="inline-start" />
							Drop
						</Button>
					</>
				)}
				<Popover open={open === 'moveTo'} onOpenChange={opener('moveTo')}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
						<FolderInputIcon data-icon="inline-start" />
						Move to…
					</PopoverTrigger>
					<PopoverContent className="w-80 p-1.5" align="start">
						<ThreadPicker
							threads={threads}
							first="Top level"
							start={thread.parentId}
							exclude={[thread.id, ...descendantsOf(threads, thread.id).map(t => t.id)]}
							onPick={parentId => {
								setOpen(null);
								if (parentId !== thread.parentId) onMoveTo(parentId);
							}}
						/>
					</PopoverContent>
				</Popover>
				{/* Only a Thread at the top of its tree is put in a project or area;
				the Threads under it belong where it does. */}
				{thread.parentId === null && (
					<Popover open={open === 'belongs'} onOpenChange={opener('belongs')}>
						<PopoverTrigger render={<Button variant="ghost" size="sm" className="max-w-64" />}>
							<BoxIcon data-icon="inline-start" />
							<span className="truncate">{belongingLabel(thread.belongs, order) ?? 'Project'}</span>
						</PopoverTrigger>
						<PopoverContent className="w-80 p-1.5" align="start">
							<BelongsPicker order={order} start={thread.belongs} onPick={belongs => pick(() => onEdit({belongs}))} />
						</PopoverContent>
					</Popover>
				)}
				<Button variant="ghost" size="sm" onClick={e => onAddChild(e.currentTarget.getBoundingClientRect())}>
					<PlusIcon data-icon="inline-start" />
					Child Thread
				</Button>
				{onOpen && (
					<Button variant="ghost" size="sm" onClick={onOpen}>
						<MaximizeIcon data-icon="inline-start" />
						Open
					</Button>
				)}
			</div>
			<section className="flex flex-col gap-1">
				<h3 className="text-xs font-medium text-muted-foreground">Summary</h3>
				<Field value={thread.summary} placeholder="A few short bullet points" multiline onSave={summary => onEdit({summary})} />
			</section>
			<section className={cn('flex flex-col gap-1', ended && 'hidden')}>
				<h3 className="text-xs font-medium text-muted-foreground">Next</h3>
				<Field value={thread.nextStep} placeholder="The next piece of work" onSave={nextStep => onEdit({nextStep})} />
			</section>
			<section className="flex flex-col gap-1">
				<button className="self-start text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setNotesOpen(o => !o)}>
					{notesOpen ? '▾' : '▸'} Notes
				</button>
				{notesOpen && <Field value={thread.notes} placeholder="The full detail" multiline className="min-h-24" onSave={notes => onEdit({notes})} />}
			</section>
			{childThreads}
			<LinkedTasks thread={thread} threads={threads} tasks={tasks.filter(t => t.threadId === thread.id)} onTick={onTick} onAdd={onAddTask} openTask={openTask} />
		</div>
	);
}

// The row a new Thread's title is typed into. Enter makes it; Esc, or
// leaving it empty, makes nothing.
// The row a new Thread is typed into, marked so it can move like any row.
const newRow = 'new';

function NewThread({onDone}: {onDone: (title: string | null) => void}) {
	// Enter removes the row, and the blur that follows must not make it twice.
	const done = useRef(false);
	const finish = (title: string | null) => {
		if (done.current) return;
		done.current = true;
		onDone(title);
	};
	return (
		<div data-row={newRow} className="flex items-center gap-2 rounded-md px-2 py-1.5">
			<StateDot shown="on_me" />
			<Input
				autoFocus
				placeholder="New Thread"
				className={cn(bareInput, 'text-sm md:text-sm')}
				onKeyDown={e => {
					if (e.key === 'Enter') finish(e.currentTarget.value);
					if (e.key === 'Escape') finish(null);
				}}
				onBlur={e => finish(e.currentTarget.value)}
			/>
		</div>
	);
}

// The tree of Threads as columns, one branch at a time, beside the selected
// Thread's details. It shows what Home shows and moves with Home's keys.
export function ThreadsPage({
	threads,
	tasks,
	selectedId,
	onSelect: setSelectedId,
	opened,
	onOpened: setOpened,
	onTick,
	onEdit,
	onCreate,
	onMove,
	onAddTask,
	order,
	findRequest,
	openTask,
}: {
	openTask: OpenTask;
	// Counts up each time the phone's search button asks for the finder.
	findRequest: number;
	onAddTask: (draft: Draft) => void;
	// The projects and areas, in the sidebar's order.
	order: Belonging[];
	threads: Thread[];
	tasks: Task[];
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	// Whether the selected Thread is open on its own page in place of the
	// columns. The phone has no room for columns, so it always shows Threads
	// that way.
	opened: boolean;
	onOpened: (opened: boolean) => void;
	onTick: (id: string) => void;
	onEdit: (id: string, edit: MyEdit) => void;
	// Resolves to nothing when the Thread could not be saved.
	onCreate: (title: string, parentId: string | null, afterId: string | null) => Promise<Thread | undefined>;
	// Moves a Thread under `parentId` at `index` among all its new siblings.
	onMove: (id: string, parentId: string | null, index: number) => void;
}) {
	// The page opens in the view that shows the Thread I came to see, such as
	// one a Someday Task just became.
	const [view, setView] = useState<PageView>(() => {
		const shown = threads.find(thread => thread.id === selectedId);
		return !shown || isActive(shown, today()) ? 'active' : shown.ended === 'not_ended' ? 'bring_in' : 'ended';
	});
	// A Thread just marked Done or Dropped stays where it is, dimmed, until I
	// select another Thread or change view, as a ticked-off Task does.
	const [kept, setKept] = useState<string | null>(null);
	useEffect(() => {
		if (kept && selectedId !== kept) setKept(null);
	}, [selectedId]);
	useEffect(() => setKept(null), [view]);
	// Threads that have just left the view, kept dimmed for half a second so I
	// see what happened before the gap closes (docs/animation.md).
	const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
	// Where a new Thread's title is being typed, as Home does it: a child goes
	// last under its parent, a top-level one after the top-level Thread I am in.
	// A top-level one typed from inside a Thread remembers it, so leaving the
	// row empty goes back there.
	const [adding, setAdding] = useState<{parentId: string | null; afterId: string | null; back: Back; from: AskedFrom} | null>(null);
	// / opens the picker to jump to any Thread.
	const [finding, setFinding] = useState(false);
	useEffect(() => {
		if (findRequest) setFinding(true);
	}, [findRequest]);
	const phone = useIsMobile();
	const onePage = phone || opened;
	const selected = threads.find(t => t.id === selectedId);
	// The area under the header, where the columns or a Thread's page show.
	const body = useRef<HTMLDivElement>(null);
	const handled = useRef<Handled>(nothingHandled());
	useMotion(body, onePage ? 'page' : 'columns', view, handled);
	const rowOf = (id: string) => body.current?.querySelector<HTMLElement>(`[data-row="${id}"]`) ?? null;
	const rows = useMemo(() => treeRows(threads, {view, today: today(), keep: kept ? new Set([...leaving, kept]) : leaving}), [threads, view, kept, leaving]);
	const columns = columnsFor(rows, selectedId);
	// A child of a Thread with none yet needs a column to be typed in.
	if (adding?.parentId && !columns.some(c => c.parentId === adding.parentId)) columns.push({parentId: adding.parentId, rows: [], selectedId: null});
	const hasChildren = (id: string) => rows.some(row => row.thread.parentId === id);
	// A new Thread starts Active, so it is typed into the Active view, never
	// into Ended where it would vanish once made.
	const startAdding = (at: {parentId: string | null; afterId: string | null; back?: Back; from?: AskedFrom}) => {
		if (view === 'ended') setView('active');
		if (at.from?.kind === 'button') handled.current.arrived.add(newRow);
		setAdding({back: {kind: 'stay'}, from: {kind: 'key'}, ...at});
	};
	// A inside a Thread, on its own page or on the phone, goes back to the
	// top-level Threads first, as Home does when focused.
	const startTop = () => {
		const afterId = selected ? (ancestorsOf(threads, selected.id).at(-1) ?? selected).id : null;
		if (!(onePage && selected)) return startAdding({parentId: null, afterId});
		startAdding({parentId: null, afterId, back: {kind: 'thread', id: selected.id, ownPage: opened}});
		if (phone) setSelectedId(null);
		else setOpened(false);
	};
	const leave = (id: string) => {
		setLeaving(ids => new Set([...ids, id]));
		setTimeout(() => setLeaving(ids => new Set([...ids].filter(other => other !== id))), 500);
	};
	const setWhen = (thread: Thread, when: When) => {
		if (view === 'active' && isActive(thread, today()) && !isActive({...thread, when}, today())) leave(thread.id);
		onEdit(thread.id, {when});
	};
	// s parks an Active Thread in Someday, or brings one in, keeping whose move it is.
	const toggleActive = (thread: Thread) => {
		if (thread.ended === 'not_ended') setWhen(thread, isActive(thread, today()) ? {kind: 'someday'} : {kind: 'active'});
	};
	// x marks Done and X Dropped; either again reopens it.
	const end = (thread: Thread, how: 'done' | 'dropped') => {
		setKept(thread.id);
		onEdit(thread.id, {ended: thread.ended === how ? 'not_ended' : how});
	};
	const toggleView = (next: PageView) => setView(view === next ? 'active' : next);
	const finishAdding = async (title: string | null) => {
		const at = adding;
		if (!at) return;
		const row = rowOf(newRow);
		if (!title?.trim()) {
			// Back to the button it came from, or it fades where it is and the gap closes.
			if (at.from.kind === 'button' && row) {
				handled.current.gone.add(newRow);
				void fly(row, row.getBoundingClientRect(), at.from.at, true);
			}
			setAdding(null);
			if (at.back.kind === 'thread') {
				setSelectedId(at.back.id);
				setOpened(at.back.ownPage);
			}
			return;
		}
		// The typed row stays until the Thread arrives, then it settles there
		// as the selected Thread.
		const thread = await onCreate(title.trim(), at.parentId, at.afterId);
		handled.current.gone.add(newRow);
		if (thread) handled.current.arrived.add(thread.id);
		setAdding(null);
		if (thread) setSelectedId(thread.id);
	};
	// A new row asked for with the Child Thread button comes from the button.
	useLayoutEffect(() => {
		const row = rowOf(newRow);
		if (adding?.from.kind !== 'button' || !row) return;
		row.style.opacity = '0';
		void fly(row, adding.from.at, row.getBoundingClientRect(), false).then(() => (row.style.opacity = ''));
	}, [adding !== null]);
	// The row goes into its new parent's row if that is on screen, and
	// otherwise fades where it is. Then the columns fade to its new place,
	// with it still selected.
	const moveTo = (thread: Thread, parentId: string | null) => {
		const row = rowOf(thread.id);
		const into = parentId ? rowOf(parentId) : null;
		if (row) {
			const from = row.getBoundingClientRect();
			handled.current.gone.add(thread.id);
			void fly(row, from, into ? into.getBoundingClientRect() : from, true);
		}
		onMove(thread.id, parentId, childrenOf(threads, parentId).filter(t => t.id !== thread.id).length);
	};
	// On the laptop a Thread's own page grows out of its row, and Back to
	// columns shrinks it back there.
	const grewFrom = useRef<DOMRect | null>(null);
	const clipTo = (r: DOMRect) => {
		const box = body.current!.getBoundingClientRect();
		return `inset(${r.top - box.top}px ${box.right - r.right}px ${box.bottom - r.bottom}px ${r.left - box.left}px round 8px)`;
	};
	const openPage = (row = selectedId ? rowOf(selectedId) : null) => {
		grewFrom.current = row?.getBoundingClientRect() ?? null;
		setOpened(true);
	};
	useLayoutEffect(() => {
		// Closed some other way, such as with the browser's Back, so a later
		// opening does not grow from a row that has since moved.
		if (!opened) grewFrom.current = null;
		if (!opened || phone || !grewFrom.current) return;
		body.current?.animate([{clipPath: clipTo(grewFrom.current), opacity: 0.4}, {clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1}], {duration: ms * 1.6, easing: ease});
	}, [opened]);
	const closePage = () => {
		const box = body.current;
		const to = grewFrom.current;
		grewFrom.current = null;
		if (!box || !to) return setOpened(false);
		box.animate([{clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1}, {clipPath: clipTo(to), opacity: 0.4}], {duration: ms * 1.6, easing: ease, fill: 'forwards'})
			.finished.then(shrink => {
				flushSync(() => setOpened(false));
				shrink.cancel();
			});
	};
	// One Thread per screen: going into a Thread slides its screen in from the
	// right over the one I left, and going back slides that one out to the right.
	const screenBox = useRef<HTMLDivElement>(null);
	const slide = useRef<{into: boolean; left: HTMLElement} | null>(null);
	const go = (id: string | null) => {
		const screen = screenBox.current?.firstElementChild as HTMLElement | null;
		const into = id !== null && threads.find(t => t.id === id)?.parentId === (selected?.id ?? null);
		if (screen) {
			const left = pinned(screen, screen.getBoundingClientRect(), into ? 30 : 45);
			left.classList.add('bg-background');
			slide.current = {into, left};
		}
		setSelectedId(id);
	};
	useLayoutEffect(() => {
		const s = slide.current;
		const screen = screenBox.current?.firstElementChild as HTMLElement | null;
		if (!s) return;
		slide.current = null;
		if (s.into && screen) {
			Object.assign(screen.style, {position: 'relative', zIndex: '35'});
			void screen.animate([{transform: 'translateX(100%)'}, {transform: 'none'}], {duration: ms * 1.4, easing: ease}).finished.then(() => {
				Object.assign(screen.style, {position: '', zIndex: ''});
				s.left.remove();
			});
		} else {
			void s.left.animate([{transform: 'none'}, {transform: 'translateX(100%)'}], {duration: ms * 1.4, easing: ease, fill: 'forwards'}).finished.then(() => s.left.remove());
		}
	}, [selectedId]);
	// Where `id` sits among all its siblings, shown or hidden, without itself.
	const othersAt = (id: string, target: string) => {
		const thread = threads.find(t => t.id === id)!;
		return childrenOf(threads, thread.parentId).filter(t => t.id !== id).findIndex(t => t.id === target);
	};
	// J and K swap with the next shown sibling, so a hidden one never makes a
	// press look like it did nothing.
	const nudge = (by: 1 | -1) => {
		if (!selected) return;
		const shown = rows.filter(row => row.thread.parentId === selected.parentId).map(row => row.thread.id);
		const other = shown[shown.indexOf(selected.id) + by];
		if (other) onMove(selected.id, selected.parentId, othersAt(selected.id, other) + (by > 0 ? 1 : 0));
	};
	const sensors = useSensors(
		// The mouse sensor ignores fingers, so on a phone only a long press
		// starts a drag and a swipe always scrolls.
		useSensor(MouseSensor, {activationConstraint: {distance: 6}}),
		useSensor(TouchSensor, {activationConstraint: {delay: 300, tolerance: 8}}),
	);
	const onDragEnd = ({active, over}: DragEndEvent) => {
		const id = String(active.id);
		if (!over || over.id === id) return;
		const thread = threads.find(t => t.id === id)!;
		const shown = rows.filter(row => row.thread.parentId === thread.parentId).map(row => row.thread.id);
		const target = String(over.id);
		if (!shown.includes(target)) return;
		const down = shown.indexOf(target) > shown.indexOf(id);
		// The drag has already put every row where it goes.
		handled.current.settled = true;
		onMove(id, thread.parentId, othersAt(id, target) + (down ? 1 : 0));
	};

	const details = (thread: Thread, extra: {onOpen?: () => void; childThreads?: ReactNode}) => (
		<Details
			key={thread.id}
			thread={thread}
			threads={threads}
			tasks={tasks}
			onTick={onTick}
			onEdit={edit => onEdit(thread.id, edit)}
			onAddChild={at => startAdding({parentId: thread.id, afterId: null, from: {kind: 'button', at}})}
			onWhen={when => setWhen(thread, when)}
			onEnd={how => end(thread, how)}
			onAddTask={onAddTask}
			openTask={openTask}
			order={order}
			onMoveTo={parentId => moveTo(thread, parentId)}
			{...extra}
		/>
	);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (adding || finding || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, [role=dialog], [role=menu]')) return;
			// Shift with a letter can arrive in either case, so it is read as upper case.
			const key = e.shiftKey && e.key.length === 1 ? e.key.toUpperCase() : e.key;
			const siblings = rows.filter(row => row.thread.parentId === (selected?.parentId ?? null)).map(row => row.thread.id);
			const at = selectedId ? siblings.indexOf(selectedId) : -1;
			const first = (parentId: string | null) => rows.find(row => row.thread.parentId === parentId)?.thread.id;
			if (key === 'j' || key === 'ArrowDown') setSelectedId(siblings[Math.min(siblings.length - 1, at + 1)] ?? null);
			else if (key === 'k' || key === 'ArrowUp') setSelectedId(siblings[Math.max(0, at - 1)] ?? null);
			else if (key === 'l' || key === 'ArrowRight') setSelectedId(selectedId ? (first(selectedId) ?? selectedId) : (first(null) ?? null));
			else if ((key === 'h' || key === 'ArrowLeft') && selected?.parentId) setSelectedId(selected.parentId);
			else if (key === 'J') nudge(1);
			else if (key === 'K') nudge(-1);
			else if (key === '.') toggleView('bring_in');
			else if (key === ',') toggleView('ended');
			else if (key === 'e' && selected) onEdit(selected.id, {whoseMove: selected.whoseMove === 'on_me' ? 'waiting' : 'on_me'});
			else if (key === 's' && selected) toggleActive(selected);
			else if (key === 'x' && selected) end(selected, 'done');
			else if (key === 'X' && selected) end(selected, 'dropped');
			else if (key === 'a' && selected) startAdding({parentId: selected.id, afterId: null});
			// A Thread's own page has no top-level list to type a new one into.
			else if (key === 'A') startTop();
			else if (key === '/') setFinding(true);
			else if (key === 'Enter' && selected && !onePage) openPage();
			else return;
			e.preventDefault();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const [title, TitleIcon] = viewTitle[view];
	const empty = view === 'ended' ? 'Nothing has ended yet.' : 'Nothing is Active.';

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-wrap items-center gap-1 px-4 pt-4 pb-5 md:px-8 md:pt-10">
				{!(phone && selected) && (
					<h1 className="mr-auto flex items-center gap-3 font-heading text-2xl font-semibold tracking-tight">
						<TitleIcon className="size-[0.9em]" style={{color: 'var(--icon-bright)'}} />
						{title}
					</h1>
				)}
				{opened && !phone && (
					<Button variant="ghost" size="sm" className="text-muted-foreground" onClick={closePage}>
						Back to columns
					</Button>
				)}
				<Button variant={view === 'bring_in' ? 'secondary' : 'ghost'} size="sm" className={cn('text-muted-foreground', phone && selected && 'ml-auto')} onClick={() => toggleView('bring_in')}>
					<ArchiveIcon data-icon="inline-start" />
					Bring in
				</Button>
				<Button variant={view === 'ended' ? 'secondary' : 'ghost'} size="sm" className="text-muted-foreground" onClick={() => toggleView('ended')}>
					<BookCheckIcon data-icon="inline-start" />
					Ended
				</Button>
			</div>
			<div ref={body} className="flex min-h-0 flex-1 flex-col">
				{onePage ? (
					<div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
						<div ref={screenBox} className="mx-auto w-full max-w-3xl md:px-8">
							<ThreadScreen
								rows={rows}
								view={view}
								empty={empty}
								selected={selected}
								adding={adding !== null}
								onSelect={id => (id || phone ? go(id) : closePage())}
								newThread={adding && adding.parentId === (selected?.id ?? null) && <NewThread onDone={finishAdding} />}
								newThreadAfter={adding?.afterId ?? null}
								details={list => selected && details(selected, {childThreads: list})}
							/>
						</div>
					</div>
				) : (
					<div className="flex min-h-0 flex-1 overflow-x-auto border-t">
						{columns.map(column => (
							<div key={column.parentId ?? 'top'} data-column={column.parentId ?? 'top'} data-fade className="flex w-64 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-background p-2">
								<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
									<SortableContext items={column.rows.map(row => row.thread.id)} strategy={verticalListSortingStrategy}>
										{column.rows.map(row => [
											<ColumnRow
												key={row.thread.id}
												row={row}
												view={view}
												selected={column.selectedId === row.thread.id}
												away={adding !== null}
												hasChildren={hasChildren(row.thread.id)}
												onPick={() => setSelectedId(row.thread.id)}
												onOpen={el => {
													setSelectedId(row.thread.id);
													openPage(el);
												}}
											/>,
											adding && column.parentId === null && adding.parentId === null && adding.afterId === row.thread.id && <NewThread key="new" onDone={finishAdding} />,
										])}
									</SortableContext>
								</DndContext>
								{adding && adding.parentId === column.parentId && (adding.parentId !== null || !adding.afterId) && <NewThread onDone={finishAdding} />}
								{column.parentId === null && column.rows.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{empty}</p>}
							</div>
						))}
						<div className="min-w-[22rem] flex-1 overflow-y-auto p-6" style={stepBack(adding !== null)}>
							{selected ? details(selected, {onOpen: () => openPage()}) : <p className="mt-16 text-center text-sm text-muted-foreground">Pick a Thread</p>}
						</div>
					</div>
				)}
			</div>
			<Dialog open={finding} onOpenChange={setFinding}>
				<DialogContent showCloseButton={false} className="top-[30%] p-2">
					<DialogTitle className="sr-only">Find a Thread</DialogTitle>
					<ThreadPicker
						threads={threads}
						start={selectedId}
						onPick={id => {
							setFinding(false);
							if (id) setSelectedId(id);
						}}
					/>
				</DialogContent>
			</Dialog>
		</div>
	);
}

// A Thread in a column. Dragging it up or down reorders it among the
// Threads beside it.
function ColumnRow({row, view, selected, away, hasChildren, onPick, onOpen}: {
	row: TreeRow; view: PageView; selected: boolean; away: boolean; hasChildren: boolean; onPick: () => void; onOpen: (el: HTMLElement) => void;
}) {
	const {thread, shown, dimmed} = row;
	const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id: thread.id});
	return (
		<button
			ref={setNodeRef}
			data-row={thread.id}
			style={transform ? {transform: CSS.Transform.toString(transform), transition} : stepBack(away)}
			{...attributes}
			{...listeners}
			onClick={onPick}
			onDoubleClick={e => onOpen(e.currentTarget)}
			className={cn(
				'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-300',
				selected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-accent/50',
				dimmed && 'text-muted-foreground',
				isDragging && 'relative z-10 bg-card shadow-lg',
			)}
		>
			<StateDot shown={shown} dimmed={dimmed} />
			<span className={cn('flex-1 truncate', shown === 'working' && !dimmed && 'shimmer')}>{thread.title}</span>
			<Tags thread={thread} view={view} />
			{hasChildren && <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />}
		</button>
	);
}

// One Thread on a screen of its own: back up the tree, its details with the
// Threads under it, then its Tasks. With no Thread it is the screen of
// top-level Threads, where the phone starts. Going into a Thread slides its
// screen in, as folders do in the iOS Files app, so going deeper reads as
// moving forward.
function ThreadScreen({
	rows,
	view,
	empty,
	selected,
	onSelect,
	newThread,
	newThreadAfter,
	adding,
	details,
}: {
	rows: TreeRow[];
	view: PageView;
	empty: string;
	selected: Thread | undefined;
	onSelect: (id: string | null) => void;
	newThread: ReactNode;
	// The row the new Thread is typed after, or the end when it is not shown.
	newThreadAfter: string | null;
	// While a new Thread is typed, the rest steps back.
	adding: boolean;
	details: (childThreads: ReactNode) => ReactNode;
}) {
	const under = (id: string | null) => rows.filter(row => row.thread.parentId === id);
	const shown = under(selected?.id ?? null);
	const parent = selected?.parentId ? rows.find(row => row.thread.id === selected.parentId)?.thread : undefined;
	const list = (shown.length > 0 || newThread || !selected) && (
		<section className="flex flex-col">
			{selected && <h3 className="mb-1 text-xs font-medium text-muted-foreground">Threads</h3>}
			{shown.map(row => [
				<button
					key={row.thread.id}
					data-row={row.thread.id}
					style={stepBack(adding)}
					onClick={() => onSelect(row.thread.id)}
					className={cn('flex items-center gap-2 border-b py-3 text-left text-sm transition-colors duration-300', row.dimmed && 'text-muted-foreground')}
				>
					<StateDot shown={row.shown} dimmed={row.dimmed} />
					<span className={cn('flex-1 truncate', row.shown === 'working' && !row.dimmed && 'shimmer')}>{row.thread.title}</span>
					<Tags thread={row.thread} view={view} />
					{under(row.thread.id).length > 0 && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />}
				</button>,
				row.thread.id === newThreadAfter && <Fragment key="new">{newThread}</Fragment>,
			])}
			{!shown.some(row => row.thread.id === newThreadAfter) && newThread}
			{!selected && shown.length === 0 && !newThread && <p className="py-3 text-sm text-muted-foreground">{empty}</p>}
		</section>
	);
	return (
		<div key={selected?.id ?? 'top'} data-column={`screen:${selected?.id ?? 'top'}`} className="flex min-h-full flex-col gap-4 bg-background px-4 pb-32">
			{selected && (
				<Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={() => onSelect(selected.parentId)}>
					<ChevronLeftIcon data-icon="inline-start" />
					{parent ? parent.title : 'Threads'}
				</Button>
			)}
			{selected ? details(list) : list}
		</div>
	);
}
