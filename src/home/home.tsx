// Home: the tree of Threads, and the only place to move from one Thread to
// another. It draws and handles keys, and asks the Client and the Session
// runner for everything else.

import {Box, Text, useApp, useInput, useWindowSize} from 'ink';
import {useCallback, useEffect, useRef, useState} from 'react';
import type {Client, Seen} from '../client/client.js';
import {belongsPath, homeRows, threadBelongs, type Area, type Belongs, type HomeRow, type Project} from '../core/project.js';
import {dayOf} from '../core/task.js';
import {ancestorsOf, descendantsOf, directoryOf, isActive, type ShownMove, type Thread, type View} from '../core/thread.js';
import type {OpenResult} from '../session/runner.js';
import {dayName, daysLeft, deadlineName, moveName, whenName} from '../core/words.js';
import {applyAccentColour, colours, Logo, Shimmer} from './look.js';
import {TextInput} from './text-input.js';

export type HomeDeps = {
	client: Client;
	open: (thread: Thread, directory: string) => OpenResult;
	livePanes: () => Set<string>;
	leave: () => void;
	launchDir: string;
	pollMs?: number;
	now?: () => Date;
	// Which Threads are folded, kept between runs of Home.
	initialFolded?: string[];
	saveFolded?: (ids: string[]) => void;
	// Which Thread is focused and which row is selected, kept between runs of
	// Home the same way.
	initialFocusAndSelection?: FocusAndSelection;
	saveFocusAndSelection?: (saved: FocusAndSelection) => void;
	onSelect?: (id: string) => void;
	// False while nobody can see Home, so it stops asking todos for changes
	// that no one would see. The hosted Instance counts every request.
	shown?: () => boolean;
};

export type FocusAndSelection = {focusId: string | null; selectedId: string | null};

// What a saved focus and selection become once the Threads are known again.
// A focused Thread that has ended or gone leaves Home unfocused, and a
// selected row that has ended, gone or fallen outside the focus moves the
// cursor to the focused Thread. parentIds are the projects and areas, which
// can only be selected while nothing is focused.
export function restoreFocusAndSelection(saved: FocusAndSelection, threads: Thread[], parentIds: ReadonlySet<string>): FocusAndSelection {
	const open = (id: string) => threads.some(thread => thread.id === id && thread.ended === 'not_ended');
	const focusId = saved.focusId && open(saved.focusId) ? saved.focusId : null;
	const inFocus = (id: string) => focusId === null ? open(id) || parentIds.has(id)
		: open(id) && (id === focusId || descendantsOf(threads, focusId).some(thread => thread.id === id));
	return {focusId, selectedId: saved.selectedId && inFocus(saved.selectedId) ? saved.selectedId : focusId};
}

type Mode =
	| {kind: 'browse'}
	// refold and refocus say what to put back if it is cancelled.
	| {kind: 'new'; place: NewPlace; title: string; refold: boolean; refocus: string | null}
	| {kind: 'search'; query: string}
	| {kind: 'directory'; id: string; value: string};

// Starts the message shown while todos cannot be reached, so it can be told
// apart from other messages and cleared once todos answers again. Home and the
// task panel both use it.
export const unreachable = 'Cannot reach todos:';

// By default Ink erases every line of the frame and writes them all again on
// each render, so while a shimmer animates, a terminal that shows the erase
// before the rewrite flickers across the whole screen. Incremental rendering
// rewrites only the lines that changed.
export const homeRenderOptions = {alternateScreen: true, exitOnCtrlC: false, incrementalRendering: true};



// Where a new Thread goes: under a Thread, or at the top level in a project,
// an area or neither. afterId is the top-level Thread it goes after, or none
// to go last.
type NewPlace =
	| {kind: 'child'; parentId: string}
	| {kind: 'top'; belongs: Belongs; afterId: string | null};

// A project or area is changed in the web app, so on Home the keys that
// would change one say so.
const changeInWebApp = 'Change projects and areas in the web app';

const viewName: Record<Exclude<View, 'all'>, string> = {active: 'Active', bring_in: 'Active  ·  and what I could bring in', ended: 'Ended'};


export function Home(deps: HomeDeps) {
	const {client, pollMs = 1500, now = () => new Date()} = deps;
	const {exit} = useApp();
	const {columns, rows: height} = useWindowSize();
	const [threads, setThreads] = useState<Thread[]>([]);
	const [belongings, setBelongings] = useState<{projects: Project[]; areas: Area[]}>({projects: [], areas: []});
	const [loaded, setLoaded] = useState(false);
	const [view, setView] = useState<Exclude<View, 'all'>>('active');
	const [folded, setFoldedState] = useState<Set<string>>(() => new Set(deps.initialFolded ?? []));
	const setFolded = (next: Set<string>) => {
		setFoldedState(next);
		deps.saveFolded?.([...next]);
	};
	const [focusId, setFocusId] = useState<string | null>(deps.initialFocusAndSelection?.focusId ?? null);
	const [selectedId, setSelectedId] = useState<string | null>(deps.initialFocusAndSelection?.selectedId ?? null);
	// A Thread just marked Done or Dropped stays where it is, dimmed, until I
	// select another Thread or change view, as a ticked-off Task does.
	const [kept, setKept] = useState<string | null>(null);
	// Threads that have just left the view, kept dimmed for a moment so I see
	// what happened before the gap closes (docs/animation.md).
	const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
	const [query, setQuery] = useState('');
	const [mode, setMode] = useState<Mode>({kind: 'browse'});
	const [message, setMessage] = useState<string | null>(null);

	// The change number last seen, and the Threads as they were then.
	const seen = useRef<Seen>({kind: 'nothing'});
	const known = useRef<Thread[]>([]);

	const refresh = useCallback(async () => {
		try {
			const changes = await client.changes(seen.current);
			let changed = changes.kind === 'changed';
			if (changes.kind === 'changed') {
				seen.current = {kind: 'number', number: changes.number};
				known.current = changes.threads;
				applyAccentColour(changes.settings.accentColour);
				setBelongings({projects: changes.projects, areas: changes.areas});
			}
			// A Session whose pane has gone is no longer busy or asking, so its
			// Thread goes back to the state last set on it. A pane going changes
			// nothing in todos, so this looks every time.
			const live = deps.livePanes();
			for (const thread of known.current) {
				if (thread.sessionSignal && thread.sessionSignal !== 'finished' && (!thread.sessionPane || !live.has(thread.sessionPane))) {
					await client.signal(thread.id, null);
					thread.sessionSignal = null;
					changed = true;
				}
			}
			if (changed) setThreads([...known.current]);
			setLoaded(true);
			setMessage(message => (message?.startsWith(unreachable) ? null : message));
		} catch (error) {
			// The tree stays as it was last fetched, with the error as it came.
			setMessage(`${unreachable} ${error instanceof Error ? error.message : String(error)}`);
		}
	}, [client, deps]);

	useEffect(() => {
		void refresh();
		const timer = setInterval(() => {
			if (deps.shown?.() !== false) void refresh();
		}, pollMs);
		return () => clearInterval(timer);
	}, [refresh, pollMs]);

	// Focus shows one Thread and everything under it, as if it were at the top.
	const focused = threads.find(thread => thread.id === focusId);
	const scope = focused ? [{...focused, parentId: null}, ...descendantsOf(threads, focused.id)] : threads;
	const today = dayOf(now());
	const keep = kept ? new Set([...leaving, kept]) : leaving;
	// Focus shows one Thread's tree on its own, without its project or area.
	const rowsOf = (folds?: ReadonlySet<string>) => homeRows(scope, focused ? [] : belongings.projects, focused ? [] : belongings.areas, {view, today, folded: folds, keep});
	const rows = rowsOf(folded);
	// While a new Thread is being typed, its row is drawn in the tree where it
	// will go, so the lines and scrolling are worked out with it in place.
	const draft = mode.kind === 'new' ? draftRow(rows, mode) : null;
	const drawn = draft ? [...rows.slice(0, draft.at), draft.row, ...rows.slice(draft.at)] : rows;
	const lines = connectors(drawn);

	// When the selected Thread leaves the tree, for example once it is Done,
	// the selection stays at the same place rather than jumping to the top.
	const lastIndex = useRef(0);
	const found = rows.findIndex(row => row.id === selectedId);
	const index = found >= 0 ? found : Math.max(0, Math.min(lastIndex.current, rows.length - 1));
	lastIndex.current = index;
	const selected: HomeRow | undefined = rows[index];
	// The Tasks panel follows the selected Thread, and stays on the last one
	// while a project or area is selected.
	const selectedThreadId = selected?.of.kind === 'thread' ? selected.id : undefined;
	useEffect(() => {
		if (selectedThreadId) deps.onSelect?.(selectedThreadId);
	}, [selectedThreadId]);

	// The saved focus and selection are checked once the Threads first load,
	// and saved from then on, so a run that never loads keeps what was saved.
	const restored = useRef(false);
	useEffect(() => {
		if (!loaded || restored.current) return;
		restored.current = true;
		const parentIds = new Set([...belongings.projects, ...belongings.areas].map(parent => parent.id));
		const next = restoreFocusAndSelection({focusId, selectedId}, threads, parentIds);
		setFocusId(next.focusId);
		setSelectedId(next.selectedId);
	}, [loaded]);
	useEffect(() => {
		if (restored.current) deps.saveFocusAndSelection?.({focusId, selectedId: selected?.id ?? null});
	}, [loaded, focusId, selected?.id]);

	const select = (id: string | null | undefined) => {
		if (!id) return;
		setSelectedId(id);
		if (id !== kept) setKept(null);
	};

	const act = async (work: () => Promise<unknown>) => {
		try {
			setMessage(null);
			await work();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
		await refresh();
	};

	const goInto = (thread: Thread, directory: string) =>
		act(async () => {
			const result = deps.open(thread, directory);
			await client.recordSession(thread.id, result);
		});

	const enter = (thread: Thread) => {
		const directory = directoryOf(threads, thread.id);
		if (directory) void goInto(thread, directory);
		else setMode({kind: 'directory', id: thread.id, value: deps.launchDir});
	};

	const toggleMove = (thread: Thread) => void act(() => client.edit(thread.id, {whoseMove: thread.whoseMove === 'on_me' ? 'waiting' : 'on_me'}));

	const leave = (id: string) => {
		setLeaving(ids => new Set([...ids, id]));
		setTimeout(() => setLeaving(ids => new Set([...ids].filter(other => other !== id))), 500);
	};

	// s parks an Active Thread in Someday, or brings one in, keeping whose
	// move it is.
	const toggleActive = (thread: Thread) => {
		if (thread.ended !== 'not_ended') return setMessage('Reopen it first with x or X');
		if (isActive(thread, today)) {
			if (view === 'active') leave(thread.id);
			void act(() => client.edit(thread.id, {when: {kind: 'someday'}}));
		} else void act(() => client.edit(thread.id, {when: {kind: 'active'}}));
	};

	// x marks Done and X Dropped; either again reopens it.
	const end = (thread: Thread, how: 'done' | 'dropped') => {
		setKept(thread.id);
		void act(() => client.edit(thread.id, {ended: thread.ended === how ? 'not_ended' : how}));
	};

	const changeView = (next: Exclude<View, 'all'>) => {
		setView(view === next ? 'active' : next);
		setKept(null);
	};

	const jumpOnMe = (step: 1 | -1) => {
		const needsMe = (row: HomeRow) => (row.of.kind === 'thread' && row.of.row.shown === 'on_me' && !row.of.row.dimmed) || Boolean(row.folded?.onMeBelow);
		for (let i = index + step; i >= 0 && i < rows.length; i += step) {
			if (needsMe(rows[i]!)) return select(rows[i]!.id);
		}
	};

	// Moves to the next match in tree order, opening any folds above it.
	const goToMatch = (step: 1 | -1, text = query) => {
		if (!text) return;
		const order = rowsOf();
		const matches = order.filter(row => row.title.toLowerCase().includes(text.toLowerCase()));
		if (matches.length === 0) return setMessage(`Nothing matches “${text}”`);
		const ids = order.map(row => row.id);
		const here = ids.indexOf(selected?.id ?? '');
		const target = step === 1
			? matches.find(row => ids.indexOf(row.id) > here) ?? matches[0]!
			: [...matches].reverse().find(row => ids.indexOf(row.id) < here) ?? matches.at(-1)!;
		const ancestors = new Set(rowsAbove(order, ids.indexOf(target.id)).map(row => row.id));
		if ([...folded].some(id => ancestors.has(id))) setFolded(new Set([...folded].filter(id => !ancestors.has(id))));
		select(target.id);
	};

	// a on a Thread types a child, and on a project or area a top-level
	// Thread in it, unfolding the row so the new one shows. A types a
	// top-level Thread in neither, after the selected tree when that is in
	// neither too, and leaves focus, because it would be out of view. A new
	// Thread starts Active, so it is typed into the Active view, never into
	// Ended where it would vanish once made.
	const startNew = (under: HomeRow | null) => {
		if (view === 'ended') {
			setView('active');
			setKept(null);
		}
		const refold = under !== null && folded.has(under.id);
		if (refold) setFolded(new Set([...folded].filter(id => id !== under.id)));
		const refocus = under === null ? focusId : null;
		if (refocus) setFocusId(null);
		const top = selected?.of.kind === 'thread' ? (ancestorsOf(threads, selected.id).at(-1) ?? selected.of.row.thread) : null;
		const place: NewPlace = under?.of.kind === 'thread' ? {kind: 'child', parentId: under.id}
			: under ? {kind: 'top', belongs: {kind: under.of.kind, id: under.id}, afterId: null}
			: {kind: 'top', belongs: {kind: 'none'}, afterId: top?.belongs.kind === 'none' ? top.id : null};
		setMode({kind: 'new', place, title: '', refold, refocus});
	};

	// Esc, or Enter on an empty title, leaves the tree as it was.
	const cancel = () => {
		if (mode.kind === 'new') {
			if (mode.refold) setFolded(new Set([...folded, placeId(mode.place)]));
			if (mode.refocus) setFocusId(mode.refocus);
		}
		setMode({kind: 'browse'});
	};

	const createNew = (title: string) => {
		if (mode.kind !== 'new') return;
		if (!title.trim()) return cancel();
		setMode({kind: 'browse'});
		const {place} = mode;
		void act(async () => select((place.kind === 'child' ? await client.create(title, place.parentId) : await client.create(title, null, place.afterId, {belongs: place.belongs})).id));
	};

	useInput((input, key) => {
		if (mode.kind !== 'browse') {
			if (key.escape) {
				cancel();
				if (mode.kind === 'search') setQuery('');
			}
			return;
		}
		setMessage(null);
		const thread = selected?.of.kind === 'thread' ? selected.of.row.thread : undefined;
		if (selected && !thread && ['J', 'K', 'e', 's', 'x', 'X', 'f'].includes(input)) return setMessage(changeInWebApp);
		if (selected && !thread && key.return) return setMessage(`${selected.title} is a ${selected.of.kind}, which has no Session to go into. ${changeInWebApp}`);
		if (input === 'j' || key.downArrow) select(rows[Math.min(rows.length - 1, index + 1)]?.id);
		else if (input === 'k' || key.upArrow) select(rows[Math.max(0, index - 1)]?.id);
		else if (input === ']') jumpOnMe(1);
		else if (input === '[') jumpOnMe(-1);
		else if (input === 'J' && thread) void act(() => client.reorder(thread.id, 'down'));
		else if (input === 'K' && thread) void act(() => client.reorder(thread.id, 'up'));
		else if (input === 'e' && thread) toggleMove(thread);
		else if (input === 's' && thread) toggleActive(thread);
		else if (input === 'x' && thread) end(thread, 'done');
		else if (input === 'X' && thread) end(thread, 'dropped');
		else if (input === 'a' && selected) startNew(selected);
		else if (input === 'A') startNew(null);
		else if (input === 'z' && selected) toggleFold(selected);
		else if (input === 'Z') toggleAllFolds();
		else if (input === 'f' && thread) toggleFocus(thread);
		else if (input === '/') setMode({kind: 'search', query: ''});
		else if (input === 'n') goToMatch(1);
		else if (input === 'N') goToMatch(-1);
		else if (input === '.') changeView('bring_in');
		else if (input === ',') changeView('ended');
		else if (key.escape) {
			if (query) setQuery('');
			else setFocusId(null);
		} else if (key.return && thread) enter(thread);
		else if (input === 'q') deps.leave();
		else if (key.ctrl && input === 'c') exit();
	});

	// z on a row with rows under it folds or unfolds it. On one without, it
	// folds the parent and moves there, so the key always does something.
	const toggleFold = (row: HomeRow) => {
		const next = new Set(folded);
		const parent = rowsAbove(rows, index).at(0);
		if (row.folded) next.delete(row.id);
		else if (rows[index + 1] && rows[index + 1]!.depth > row.depth) next.add(row.id);
		else if (parent) {
			next.add(parent.id);
			select(parent.id);
		}
		setFolded(next);
	};

	// Z unfolds everything if anything is folded, and otherwise folds every
	// row that has rows below it, keeping the selection on what stays shown.
	const toggleAllFolds = () => {
		if (folded.size > 0) return setFolded(new Set());
		const all = rowsOf();
		setFolded(new Set(all.filter((row, i) => (all[i + 1]?.depth ?? 0) > row.depth).map(row => row.id)));
		if (selected) select(rowsAbove(rows, index).at(-1)?.id ?? selected.id);
	};

	// f on the focused Thread leaves focus. On any other, it focuses there.
	const toggleFocus = (thread: Thread) => {
		if (focusId === thread.id) return setFocusId(null);
		setFocusId(thread.id);
		select(thread.id);
	};

	const treeHeight = Math.max(3, height - 15);
	const drawnIndex = draft ? draft.at : index;
	const first = Math.max(0, Math.min(drawnIndex - Math.floor(treeHeight / 2), drawn.length - treeHeight));
	const highlight = mode.kind === 'search' ? mode.query : query;
	// The tree is as wide as its longest row and the details a fixed width,
	// and the two sit together in the middle of the screen.
	// Room is left for the tags beside a title.
	const longest = Math.max(0, ...drawn.map((row, i) => 4 + lines[i]!.length + row.title.length + 12));
	const treeWidth = Math.min(64, Math.max(30, longest + 3));
	const detailsWidth = Math.max(30, Math.min(50, columns - treeWidth - 8));

	return (
		<Box flexDirection="column" width={columns} height={height}>
			<Box marginTop={1} flexDirection="column" alignItems="center">
				<Logo />
				<Box marginTop={1}>
					<Text color={colours.faint}>Home  ·  </Text>
					<Text color={view === 'active' ? colours.faint : colours.accent}>{viewName[view]}</Text>
					{focused ? <Text color={colours.accent}>{`  ·  Focused on ${focused.title}`}</Text> : null}
				</Box>
			</Box>
			<Box flexGrow={1} marginTop={1} justifyContent="center">
				<Box flexDirection="column" width={treeWidth} paddingRight={2}>
					{loaded && drawn.length === 0 ? (
						<Text color={colours.faint}>
							{threads.length === 0 ? 'No Threads yet. Press A to start one.' : view === 'ended' ? 'Nothing has ended yet.' : 'Nothing is Active. Press . to see what you could bring in.'}
						</Text>
					) : (
						drawn.slice(first, first + treeHeight).map((row, i) => (
							<Row key={row.id} row={row} view={view} today={today} prefix={lines[first + i]!} highlight={highlight}
								selected={draft ? row === draft.row : row.id === selected?.id}
								editing={row === draft?.row ? {onChange: title => setMode({...mode, title} as Mode), onSubmit: createNew} : undefined} />
						))
					)}
				</Box>
				<Box flexDirection="column" width={detailsWidth} alignSelf="flex-start" paddingLeft={3}
					borderStyle="single" borderTop={false} borderBottom={false} borderRight={false} borderColor={colours.line}>
					{mode.kind === 'new' ? (
						<Text color={colours.faint}>{newPlaceName(mode.place, rows)}</Text>
					) : mode.kind === 'directory' ? (
						<Box flexDirection="column">
							<Text color={colours.text}>Where should this Session work?</Text>
							<Box marginTop={1}>
								<TextInput value={mode.value} onChange={value => setMode({...mode, value})} onSubmit={value => {
									setMode({kind: 'browse'});
									void act(async () => goInto(await client.edit(mode.id, {directory: value}), value));
								}} />
							</Box>
						</Box>
					) : selected?.of.kind === 'thread' ? (
						<Details thread={selected.of.row.thread} shown={selected.of.row.shown} belongsTo={belongsPath(threadBelongs(selected.of.row.thread, threads), belongings.projects, belongings.areas)} directory={directoryOf(threads, selected.id)} now={now()} today={today} />
					) : selected ? (
						<ParentDetails row={selected} belongings={belongings} today={today} />
					) : null}
				</Box>
			</Box>
			<Box marginBottom={1} flexDirection="column" alignItems="center">
				{mode.kind === 'search' ? (
					<Text>
						<Text color={colours.accent}>/</Text>
						<TextInput value={mode.query} onChange={value => setMode({kind: 'search', query: value})}
							onSubmit={value => {
								setMode({kind: 'browse'});
								setQuery(value);
								goToMatch(1, value);
							}} />
					</Text>
				) : (
					hintLines(message ?? hints(mode, view), treeWidth + detailsWidth).map((line, i) => (
						<Text key={i} color={message ? colours.accent : colours.dim}>{line}</Text>
					))
				)}
			</Box>
		</Box>
	);
}

// A project or area has a symbol of its own in place of a Thread's circle,
// drawn faint, since only a Thread can be On me.
const parentSymbol = {project: '◆ ', area: '■ '};

function Row({row, view, today, prefix, selected, highlight, editing}: {
	row: HomeRow; view: View; today: string; prefix: string; selected: boolean; highlight: string;
	editing?: {onChange: (title: string) => void; onSubmit: (title: string) => void};
}) {
	const {title, folded, of} = row;
	const shown = of.kind === 'thread' ? of.row.shown : null;
	const dimmed = of.kind === 'thread' && of.row.dimmed;
	const onMe = (shown === 'on_me' && !dimmed) || Boolean(folded?.onMeBelow);
	const ended = of.kind === 'thread' ? of.row.thread.ended : of.kind === 'project' ? of.project.ended : of.area.ended;
	const deadline = of.kind === 'thread' ? of.row.thread.deadline : of.kind === 'project' ? of.project.deadline : {kind: 'none' as const};
	// Beside the title: Someday or the day a Thread comes back, while I look
	// at what I could bring in; how it ended; and its Deadline while open.
	const tags: {text: string; colour: string}[] = [];
	if (of.kind === 'thread' && view === 'bring_in' && ended === 'not_ended' && !isActive(of.row.thread, today)) {
		const {when} = of.row.thread;
		tags.push({text: when.kind === 'on_day' ? `↻ ${dayName(when.day, today)}` : 'someday', colour: colours.dim});
	}
	if (ended !== 'not_ended') tags.push({text: ended, colour: colours.dim});
	if (deadline.kind === 'by_day' && ended === 'not_ended') {
		const soon = daysLeft(deadline.day, today) <= 1;
		tags.push({text: `⚑ ${deadlineName(deadline.day, today)}`, colour: soon ? colours.deadline : colours.faint});
	}
	return (
		<Box>
			{/* The front of the row never shrinks, so long titles cannot push
			    their indent out of line. */}
			<Box flexShrink={0}>
				<Text color={colours.accent}>{selected ? '› ' : '  '}</Text>
				<Text color={colours.line}>{prefix}</Text>
				<Text color={onMe ? colours.dot : dimmed ? colours.dim : colours.faint}>{folded ? '▸ ' : of.kind === 'thread' ? '● ' : parentSymbol[of.kind]}</Text>
			</Box>
			<Box flexShrink={1}>
				{editing ? (
					<TextInput value={title} onChange={editing.onChange} onSubmit={editing.onSubmit} />
				) : shown === 'working' && !dimmed && !highlight ? (
					<Shimmer text={title} />
				) : (
					<Text color={dimmed ? colours.dim : colours.text} bold={selected} wrap="truncate">
						<Highlighted text={title} query={highlight} />
					</Text>
				)}
			</Box>
			{tags.map(tag => (
				<Box key={tag.text} flexShrink={0} marginLeft={2}>
					<Text color={tag.colour}>{tag.text}</Text>
				</Box>
			))}
		</Box>
	);
}

export function Highlighted({text, query}: {text: string; query: string}) {
	const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
	if (at < 0) return <>{text}</>;
	return (
		<>
			{text.slice(0, at)}
			<Text color="#0b1a24" backgroundColor={colours.accent}>{text.slice(at, at + query.length)}</Text>
			{text.slice(at + query.length)}
		</>
	);
}

// Markdown as far as a terminal can show it, so a Summary reads as it does
// in the web app: bullets as •, bold as bold, code in blue and a link as its
// words underlined.
export function Formatted({text}: {text: string}) {
	return (
		<>
			{text.split('\n').map((line, i) => {
				const heading = /^#{1,6}\s+/.test(line);
				const shown = line.replace(/^#{1,6}\s+/, '').replace(/^(\s*)[-*+]\s+/, '$1• ');
				return (
					<Text key={i} color={colours.text} bold={heading}>
						{shown.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/).map((part, j) =>
							part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <Text key={j} bold>{part.slice(2, -2)}</Text>
							: part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <Text key={j} color={colours.accent}>{part.slice(1, -1)}</Text>
							: part.startsWith('[') && part.endsWith(')') ? <Text key={j} underline>{part.slice(1, part.indexOf(']('))}</Text>
							: part,
						)}
					</Text>
				);
			})}
		</>
	);
}

function Details({thread, shown, belongsTo, directory, now, today}: {thread: Thread; shown: ShownMove; belongsTo: string[]; directory: string | null; now: Date; today: string}) {
	const ended = thread.ended !== 'not_ended';
	return (
		<Box flexDirection="column">
			{belongsTo.length > 0 ? <Text color={colours.dim} wrap="truncate">{belongsTo.join('  ›  ')}</Text> : null}
			<Text color={colours.text} wrap="truncate">{thread.title}</Text>
			<Text color={colours.faint}>{ended ? (thread.ended === 'done' ? 'Done' : 'Dropped') : `${whenName(thread.when, today)}  ·  ${moveName[shown]}`}</Text>
			{thread.deadline.kind === 'by_day' ? <Text color={colours.faint}>{`⚑ ${deadlineName(thread.deadline.day, today)}`}</Text> : null}
			{directory ? <Text color={colours.faint} wrap="truncate-start">{directory}</Text> : null}
			{thread.summaryUpdatedAt ? <Text color={colours.faint}>{`Summary updated ${ago(new Date(thread.summaryUpdatedAt), now)}`}</Text> : null}
			<Box marginTop={1} flexDirection="column">
				{thread.summary ? <Formatted text={thread.summary} /> : <Text color={colours.dim}>No summary yet.</Text>}
				{thread.nextStep && !ended ? <Text color={colours.text} bold>{`Next: ${thread.nextStep}`}</Text> : null}
			</Box>
		</Box>
	);
}

// The ancestors of the row at index in the tree, the nearest first.
function rowsAbove(rows: HomeRow[], index: number): HomeRow[] {
	const above: HomeRow[] = [];
	for (let i = index - 1, depth = rows[index]?.depth ?? 0; i >= 0 && depth > 0; i--) {
		if (rows[i]!.depth < depth) {
			above.push(rows[i]!);
			depth = rows[i]!.depth;
		}
	}
	return above;
}

// The row a new Thread goes under, or after when it goes at the top level
// in neither a project nor an area.
const placeId = (place: NewPlace): string =>
	place.kind === 'child' ? place.parentId : place.belongs.kind !== 'none' ? place.belongs.id : (place.afterId ?? '');

function newPlaceName(place: NewPlace, rows: HomeRow[]): string {
	const title = rows.find(row => row.id === placeId(place))?.title;
	if (place.kind === 'child') return `New Thread under ${title}`;
	return place.belongs.kind === 'none' ? 'New top-level Thread' : `New Thread in ${title}`;
}

// A project or area as it shows on Home: what it is, where it sits, its
// Deadline and its Notes. It has no Session, so nothing more.
function ParentDetails({row, belongings, today}: {row: HomeRow; belongings: {projects: Project[]; areas: Area[]}; today: string}) {
	const {of} = row;
	if (of.kind === 'thread') return null;
	const notes = of.kind === 'project' ? of.project.notes : of.area.notes;
	const ended = of.kind === 'project' ? of.project.ended : of.area.ended;
	const area = of.kind === 'project' && of.project.area.kind === 'in' ? belongsPath({kind: 'project', id: of.project.id}, belongings.projects, belongings.areas).slice(0, -1) : [];
	return (
		<Box flexDirection="column">
			{area.length > 0 ? <Text color={colours.dim} wrap="truncate">{area.join('  ›  ')}</Text> : null}
			<Text color={colours.text} wrap="truncate">{row.title}</Text>
			<Text color={colours.faint}>{`${of.kind === 'project' ? 'Project' : 'Area'}${ended === 'done' ? '  ·  Done' : ended === 'dropped' ? '  ·  Dropped' : ''}`}</Text>
			{of.kind === 'project' && of.project.deadline.kind === 'by_day' ? <Text color={colours.faint}>{`⚑ ${deadlineName(of.project.deadline.day, today)}`}</Text> : null}
			<Box marginTop={1} flexDirection="column">
				{notes ? <Formatted text={notes} /> : <Text color={colours.dim}>No notes yet.</Text>}
			</Box>
		</Box>
	);
}

// Where the row for a new Thread goes: last under its parent, project or
// area, or after the top-level Thread and everything under it. Without
// any, at the bottom.
function draftRow(rows: HomeRow[], mode: Extract<Mode, {kind: 'new'}>): {at: number; row: HomeRow} {
	const {place} = mode;
	const from = rows.findIndex(row => row.id === placeId(place));
	const end = from < 0 ? -1 : rows.findIndex((row, i) => i > from && row.depth <= rows[from]!.depth);
	const at = from < 0 || end < 0 ? rows.length : end;
	const under = place.kind === 'child' || place.belongs.kind !== 'none';
	const depth = under && from >= 0 ? rows[from]!.depth + 1 : 0;
	const thread: Thread = {
		id: '', title: mode.title, summary: '', nextStep: '', notes: '', whoseMove: 'on_me', when: {kind: 'active'}, ended: 'not_ended',
		deadline: {kind: 'none'}, reminder: {kind: 'none'}, parentId: place.kind === 'child' ? place.parentId : null, belongs: place.kind === 'top' ? place.belongs : {kind: 'none'}, position: 0,
		directory: null, claudeSessionId: null, sessionPane: null, sessionSignal: null,
		myEditAt: null, sessionSeenAt: null, summaryUpdatedAt: null, createdAt: '',
	};
	const row = {thread, depth, shown: 'on_me' as const, dimmed: false, hasChildren: false, folded: null};
	return {at, row: {id: '', title: mode.title, depth, folded: null, of: {kind: 'thread', row}}};
}

// Breaks the key hints into lines no wider than the tree and details, at the
// dots, so they can sit centred under them.
export function hintLines(text: string, width: number): string[] {
	const lines: string[] = [];
	for (const part of text.split(' · ')) {
		const last = lines.at(-1);
		if (last !== undefined && last.length + 3 + part.length <= width) lines[lines.length - 1] = `${last} · ${part}`;
		else lines.push(part);
	}
	return lines;
}

// The lines the `tree` command draws in front of each row. Top-level
// Threads have none.
export function connectors(rows: {depth: number}[]): string[] {
	const isLast = rows.map((row, i) => {
		for (let j = i + 1; j < rows.length; j++) {
			if (rows[j]!.depth < row.depth) return true;
			if (rows[j]!.depth === row.depth) return false;
		}
		return true;
	});
	const lastAt: boolean[] = [];
	return rows.map((row, i) => {
		lastAt[row.depth] = isLast[i]!;
		if (row.depth === 0) return '';
		let prefix = '';
		for (let depth = 1; depth < row.depth; depth++) prefix += lastAt[depth] ? '    ' : '│   ';
		return prefix + (isLast[i] ? '└── ' : '├── ');
	});
}

export function ago(then: Date, now: Date): string {
	const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
	const say = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
	if (minutes < 1) return 'just now';
	if (minutes < 60) return say(minutes, 'minute');
	if (minutes < 60 * 24) return say(Math.round(minutes / 60), 'hour');
	if (minutes < 60 * 24 * 60) return say(Math.round(minutes / 60 / 24), 'day');
	return say(Math.round(minutes / 60 / 24 / 30), 'month');
}

function hints(mode: Mode, view: View): string {
	switch (mode.kind) {
		case 'browse':
			return `j k move · [ ] on me · e on me/waiting · ${view === 'bring_in' ? 's bring in or park' : 's park'} · x done · X dropped · . bring in · , ended · a child · A top level · J K reorder · z Z fold · f focus · / search · ⏎ go in · q quit`;
		case 'new':
		case 'directory':
			return '⏎ save · esc cancel';
		case 'search':
			return '⏎ search · esc cancel';
	}
}
