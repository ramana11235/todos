// The task panel: the light way to work with Tasks, the same on Home and in
// every Thread. It shows only Tasks and Thread titles, and nothing in it goes
// into another Thread (CONTEXT.md, notes.md "Task panel").

import {Box, Text, useInput, useWindowSize} from 'ink';
import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import type {Client, Seen} from '../client/client.js';
import {belongingOrder, type Belonging} from '../core/project.js';
import {dayOf, listNames, listOf, listRows, lists, type List, type Task, type TaskRow} from '../core/task.js';
import {descendantsOf, type Thread} from '../core/thread.js';
import {dayName} from '../core/words.js';
import {Highlighted, hintLines} from './home.js';
import {colours} from './look.js';
import {TextInput} from './text-input.js';

export type TaskPanelDeps = {
	client: Client;
	// The Thread the panel is in, or the one selected on Home.
	currentThread: () => string | null;
	// The list the panel was last on, the same everywhere.
	initialList?: List;
	saveList?: (list: List) => void;
	pollMs?: number;
	now?: () => Date;
	// False while nobody can see the panel, so it stops asking todos for
	// changes that no one would see. The hosted Instance counts every request.
	shown?: () => boolean;
};

type Mode =
	| {kind: 'browse'}
	| {kind: 'add'; after: Task | null; title: string}
	| {kind: 'rename'; task: Task; title: string}
	| {kind: 'search'; query: string};

// Starts the message shown while todos cannot be reached, so it can be told
// apart from other messages and cleared once todos answers again.
const unreachable = 'Cannot reach todos:';

export function TaskPanel(deps: TaskPanelDeps) {
	const {client, pollMs = 1500, now = () => new Date()} = deps;
	const {rows: height} = useWindowSize();
	const [tasks, setTasks] = useState<Task[]>([]);
	const [threads, setThreads] = useState<Thread[]>([]);
	const [order, setOrder] = useState<Belonging[]>([]);
	const [current, setCurrent] = useState<string | null>(null);
	const [list, setListState] = useState<List>(deps.initialList ?? 'today');
	const [filter, setFilter] = useState(false);
	// Tasks ticked off since the list was opened. They stay in view, dimmed,
	// so Enter again can untick them.
	const [ticked, setTicked] = useState<Map<string, Task>>(new Map());
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [query, setQuery] = useState('');
	const [mode, setMode] = useState<Mode>({kind: 'browse'});
	const [message, setMessage] = useState<string | null>(null);

	const seen = useRef<Seen>({kind: 'nothing'});

	const refresh = useCallback(async () => {
		try {
			const changes = await client.changes(seen.current);
			if (changes.kind === 'changed') {
				seen.current = {kind: 'number', number: changes.number};
				setTasks(changes.tasks);
				setThreads(changes.threads);
				setOrder(belongingOrder(changes.projects, changes.areas));
			}
			setCurrent(deps.currentThread());
			setMessage(message => (message?.startsWith(unreachable) ? null : message));
		} catch (error) {
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

	const setList = (next: List) => {
		setListState(next);
		deps.saveList?.(next);
		setTicked(new Map());
	};

	const currentThread = threads.find(thread => thread.id === current);
	const inScope = filter && current ? new Set([current, ...descendantsOf(threads, current).map(thread => thread.id)]) : null;
	const visible = [...tasks.filter(task => !ticked.has(task.id)), ...ticked.values()]
		.filter(task => !inScope || (task.threadId !== null && inScope.has(task.threadId)));
	const today = dayOf(now());
	const rows = listRows(visible, threads, list, today, order);
	const taskRows = rows.flatMap(row => (row.kind === 'task' ? [row.task] : []));

	// When the selected Task leaves the list, the selection stays at the same
	// place rather than jumping to the top.
	const lastIndex = useRef(0);
	const found = taskRows.findIndex(task => task.id === selectedId);
	const index = found >= 0 ? found : Math.max(0, Math.min(lastIndex.current, taskRows.length - 1));
	lastIndex.current = index;
	const selected = taskRows[index];

	const act = async (work: () => Promise<unknown>) => {
		try {
			setMessage(null);
			await work();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
		await refresh();
	};

	const tick = (task: Task) =>
		act(async () => {
			const next = await client.editTask(task.id, {ended: task.ended === 'done' ? 'not_ended' : 'done'});
			setTicked(new Map(ticked).set(task.id, next));
		});

	// Moves to the next Task whose title matches, in the order shown.
	const goToMatch = (step: 1 | -1, text = query) => {
		if (!text) return;
		const matches = taskRows.map((task, i) => (task.title.toLowerCase().includes(text.toLowerCase()) ? i : -1)).filter(i => i >= 0);
		if (matches.length === 0) return setMessage(`Nothing matches “${text}”`);
		const target = step === 1 ? matches.find(i => i > index) ?? matches[0]! : [...matches].reverse().find(i => i < index) ?? matches.at(-1)!;
		setSelectedId(taskRows[target]!.id);
	};

	useInput((input, key) => {
		if (mode.kind !== 'browse') {
			if (key.escape) setMode({kind: 'browse'});
			return;
		}
		setMessage(null);
		if (key.tab) setList(lists[(lists.indexOf(list) + (key.shift ? -1 : 1) + lists.length) % lists.length]!);
		else if (input === 'j' || key.downArrow) setSelectedId(taskRows[Math.min(taskRows.length - 1, index + 1)]?.id ?? null);
		else if (input === 'k' || key.upArrow) setSelectedId(taskRows[Math.max(0, index - 1)]?.id ?? null);
		else if (input === 'J' && selected) void act(() => client.reorderTask(selected.id, 'down'));
		else if (input === 'K' && selected) void act(() => client.reorderTask(selected.id, 'up'));
		else if (key.return && selected) void tick(selected);
		else if (input === 'r' && selected) setMode({kind: 'rename', task: selected, title: selected.title});
		// A Task needs a Date to be in Upcoming, so an empty Upcoming has
		// nothing to add after.
		else if (input === 'a' && (selected || list !== 'upcoming')) setMode({kind: 'add', after: selected ?? null, title: ''});
		else if (input === '/') setMode({kind: 'search', query: ''});
		else if (input === 'n') goToMatch(1);
		else if (input === 'N') goToMatch(-1);
		else if (input === 'f') setFilter(!filter);
		else if (key.escape) setQuery('');
	});

	const add = (title: string, after: Task | null) => {
		setMode({kind: 'browse'});
		if (!title.trim()) return;
		void act(async () => {
			const task = await client.addTask(after
				? {title, after: after.id}
				: {title, when: {kind: list === 'upcoming' ? 'inbox' : list}, threadId: inScope ? current : null});
			setSelectedId(task.id);
		});
	};

	const adding = mode.kind === 'add' ? (
		<Text key="adding">
			<Text color={colours.dim}>○ </Text>
			<TextInput value={mode.title} onChange={title => setMode({...mode, title})} onSubmit={title => add(title, mode.after)} />
		</Text>
	) : null;

	const drawn: ReactNode[] = [];
	rows.forEach((row, i) => {
		// A heading straight under a day's heading needs no gap, since the day
		// already sets the group apart.
		const key = row.kind === 'belonging' ? `b-${row.belonging.path.join('/')}` : row.kind === 'day' ? `d-${row.day}` : row.kind === 'header' ? `h-${row.thread.id}` : row.task.id;
		drawn.push(<RowView key={key} row={row} today={today} first={i === 0 || rows[i - 1]!.kind === 'day'}
			selected={row.kind === 'task' && row.task.id === selected?.id} mode={mode} query={mode.kind === 'search' ? mode.query : query}
			onRename={title => {
				setMode({kind: 'browse'});
				if (mode.kind === 'rename' && title.trim()) void act(() => client.editTask(mode.task.id, {title}));
			}}
			onRenameChange={title => mode.kind === 'rename' && setMode({...mode, title})} />);
		if (mode.kind === 'add' && row.kind === 'task' && row.task.id === mode.after?.id) drawn.push(adding);
	});
	if (mode.kind === 'add' && !mode.after) {
		if (inScope && currentThread) drawn.push(<Header key="h-new" title={currentThread.title} first={drawn.length === 0} />);
		drawn.push(adding);
	}

	return (
		<Box flexDirection="column" height={height} paddingX={2} paddingY={1}>
			<Text wrap="truncate">
				{lists.map((name, i) => (
					<Text key={name} color={name === list ? colours.blue : colours.dim} bold={name === list}>
						{i ? '  ' : ''}
						{listNames[name]}
					</Text>
				))}
			</Text>
			<Text color={colours.faint} wrap="truncate">{inScope ? `Only ${currentThread?.title ?? ''}` : ' '}</Text>
			<Box flexDirection="column" flexGrow={1} overflow="hidden">
				{drawn.length ? drawn : <Text color={colours.dim}>Nothing here</Text>}
			</Box>
			{mode.kind === 'search' ? (
				<Text>
					<Text color={colours.blue}>/</Text>
					<TextInput value={mode.query} onChange={value => setMode({kind: 'search', query: value})}
						onSubmit={value => {
							setMode({kind: 'browse'});
							setQuery(value);
							goToMatch(1, value);
						}} />
				</Text>
			) : (
				hintLines(message ?? hints(mode), 40).map((line, i) => (
					<Text key={i} color={message ? colours.blue : colours.dim}>{line}</Text>
				))
			)}
		</Box>
	);
}

function Header({title, first}: {title: string; first: boolean}) {
	return (
		<Box marginTop={first ? 0 : 1}>
			<Text color={colours.dim} wrap="truncate">{`-- ${title} --`}</Text>
		</Box>
	);
}

// A day in Upcoming over its Tasks and their Threads, bright and bold as a
// project or area is, since Upcoming has no project or area headings.
function DayHeading({day, today, first}: {day: string; today: string; first: boolean}) {
	return (
		<Box marginTop={first ? 0 : 1}>
			<Text color={colours.text} bold wrap="truncate">{dayName(day, today)}</Text>
		</Box>
	);
}

// A project or area over its Tasks and their Threads, brighter than a
// Thread's heading so the two levels read apart.
function BelongingHeading({belonging, first}: {belonging: Belonging; first: boolean}) {
	return (
		<Box marginTop={first ? 0 : 1}>
			<Text color={colours.text} bold wrap="truncate">
				{belonging.path.join('  ›  ')}
				{belonging.ended !== 'not_ended' ? <Text color={colours.dim} bold={false}>{`  ${belonging.ended}`}</Text> : null}
			</Text>
		</Box>
	);
}

function RowView({row, today, first, selected, mode, query, onRename, onRenameChange}: {
	row: TaskRow; today: string; first: boolean; selected: boolean; mode: Mode; query: string;
	onRename: (title: string) => void; onRenameChange: (title: string) => void;
}) {
	if (row.kind === 'belonging') return <BelongingHeading belonging={row.belonging} first={first} />;
	if (row.kind === 'day') return <DayHeading day={row.day} today={today} first={first} />;
	if (row.kind === 'header') return <Header title={row.thread.title} first={first} />;
	const {task} = row;
	const done = task.ended === 'done';
	const renaming = selected && mode.kind === 'rename';
	return (
		<Box justifyContent="space-between">
			<Text wrap="truncate" color={done ? colours.dim : selected ? colours.text : colours.faint} strikethrough={done}>
				<Text color={selected ? colours.blue : colours.dim}>{done ? '● ' : '○ '}</Text>
				{renaming ? <TextInput value={mode.title} onChange={onRenameChange} onSubmit={onRename} /> : <Highlighted text={task.title} query={query} />}
			</Text>
			{/* In Upcoming the day's heading already says it. */}
			{task.when.kind === 'on_day' && listOf(task, today) !== 'upcoming' ? <Text color={colours.dim}>{` ${dayName(task.when.day, today)}`}</Text> : null}
		</Box>
	);
}

function hints(mode: Mode): string {
	switch (mode.kind) {
		case 'browse':
			return 'tab lists · ⏎ tick · r rename · a add · J K reorder · / search · f filter';
		case 'add':
		case 'rename':
			return '⏎ save · esc cancel';
		case 'search':
			return '⏎ search · esc cancel';
	}
}
