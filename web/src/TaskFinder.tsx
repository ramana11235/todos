import {useEffect, useRef, useState} from 'react';
import {cn} from '@/lib/utils';
import {Input} from '@/components/ui/input';
import {listNames, listOf, lists, type Task} from '../../src/core/task';
import type {Belonging} from '../../src/core/project';
import type {Thread} from '../../src/core/thread';
import {belongingLabel} from './Pages';
import {titleClass} from './TaskRow';
import {placeIcons} from './When';
import {today} from './days';

// Finds any open Task by part of its title, from every list, as the Thread
// picker finds a Thread: arrows move, Enter or a click picks, Esc closes.
// Each match says which list it is in, and its Thread, project or area.
export function TaskFinder({tasks, threads, order, onPick}: {
	tasks: Task[];
	threads: Thread[];
	order: Belonging[];
	onPick: (task: Task) => void;
}) {
	const [query, setQuery] = useState('');
	const [at, setAt] = useState(0);
	const now = today();
	const q = query.trim().toLowerCase();
	const found = tasks
		.filter(t => t.ended === 'not_ended' && t.title.toLowerCase().includes(q))
		.sort((a, b) => lists.indexOf(listOf(a, now)) - lists.indexOf(listOf(b, now)) || a.position - b.position);
	const list = useRef<HTMLDivElement>(null);
	useEffect(() => {
		list.current?.querySelector('[data-at=true]')?.scrollIntoView({block: 'nearest'});
	}, [at]);
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<Input
				autoFocus
				placeholder="Find a Task"
				value={query}
				onChange={e => {
					setQuery(e.target.value);
					setAt(0);
				}}
				onKeyDown={e => {
					if (e.key === 'ArrowDown') setAt(a => Math.min(found.length - 1, a + 1));
					else if (e.key === 'ArrowUp') setAt(a => Math.max(0, a - 1));
					else if (e.key === 'Enter' && found[at]) onPick(found[at]);
					else return;
					e.preventDefault();
				}}
			/>
			<div ref={list} className="flex max-h-72 flex-col overflow-y-auto">
				{found.map((task, i) => {
					const where = listOf(task, now);
					const [Icon, colour] = placeIcons[where];
					const under = task.threadId ? threads.find(t => t.id === task.threadId)?.title : belongingLabel(task.belongs, order);
					return (
						<button
							key={task.id}
							data-at={i === at}
							className={cn('flex w-full min-w-0 flex-col items-start rounded-md px-2 py-1 text-left', i === at && 'bg-accent')}
							onMouseEnter={() => setAt(i)}
							onClick={() => onPick(task)}
						>
							<span className={cn('w-full truncate', titleClass)}>{task.title}</span>
							<span className="flex w-full items-center gap-1 truncate text-xs text-muted-foreground">
								<Icon className="size-3 shrink-0" style={{color: colour}} />
								{listNames[where]}
								{under && <span className="truncate">· {under}</span>}
							</span>
						</button>
					);
				})}
				{found.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">Nothing matches</p>}
			</div>
		</div>
	);
}
