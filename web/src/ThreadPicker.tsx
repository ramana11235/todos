import {useEffect, useRef, useState} from 'react';
import {cn} from '@/lib/utils';
import {Input} from '@/components/ui/input';
import {shownMove, treeRows, type Thread} from '../../src/core/thread';
import {today} from './days';
import {StateDot} from './StateDot';

// One picker of Threads for every job that needs one: linking a Task,
// placing a new Thread and moving a Thread. Until I type it shows the tree,
// indented as on Home; once I type it shows the matches flat, each with the
// Thread it sits under, because an indented match would be cut off from its
// parent. The first entry, such as "None" or "Top level", picks no Thread;
// finding a Thread to go to has none.
export function ThreadPicker({
	threads,
	first,
	start = null,
	exclude = [],
	onPick,
}: {
	threads: Thread[];
	first?: string;
	start?: string | null;
	exclude?: string[];
	onPick: (id: string | null) => void;
}) {
	const [query, setQuery] = useState('');
	const byId = new Map(threads.map(t => [t.id, t]));
	// The tree is the one Home shows, so a hidden Thread with an open one
	// below it stays, dimmed, and the indents read true. Typing searches every
	// Thread that has not ended, Someday ones too.
	const tree = treeRows(threads, {view: query ? 'all' : 'active', today: today()}).filter(row => !exclude.includes(row.thread.id));
	const matches = query ? tree.filter(row => row.thread.ended === 'not_ended' && row.thread.title.toLowerCase().includes(query.toLowerCase())) : tree;
	const entries = first && !query ? [null, ...matches] : matches;
	const [at, setAt] = useState(() => Math.max(0, entries.findIndex(e => (e?.thread.id ?? null) === start)));
	const list = useRef<HTMLDivElement>(null);
	useEffect(() => {
		list.current?.querySelector('[data-at=true]')?.scrollIntoView({block: 'nearest'});
	}, [at]);
	return (
		<div className="flex flex-col gap-1">
			<Input
				autoFocus
				placeholder="Find a Thread"
				value={query}
				onChange={e => {
					setQuery(e.target.value);
					setAt(0);
				}}
				onKeyDown={e => {
					if (e.key === 'ArrowDown') setAt(a => Math.min(entries.length - 1, a + 1));
					else if (e.key === 'ArrowUp') setAt(a => Math.max(0, a - 1));
					else if (e.key === 'Enter' && entries[at] !== undefined) onPick(entries[at]?.thread.id ?? null);
					else return;
					e.preventDefault();
				}}
			/>
			<div ref={list} className="flex max-h-72 flex-col overflow-y-auto">
				{entries.map((entry, i) => {
					const parent = entry?.thread.parentId ? byId.get(entry.thread.parentId) : undefined;
					return (
						<button
							key={entry?.thread.id ?? 'none'}
							data-at={i === at}
							className={cn('flex flex-col items-start rounded-md px-2 py-1 text-left text-sm', i === at && 'bg-accent')}
							onMouseEnter={() => setAt(i)}
							onClick={() => onPick(entry?.thread.id ?? null)}
						>
							{entry ? (
								<>
									<span className="flex w-full items-center gap-2" style={{paddingLeft: `${(query ? 0 : entry.depth) * 1.25}rem`}}>
										<StateDot shown={entry.shown} dimmed={entry.dimmed} />
										<span className={cn('truncate', shownMove(entry.thread) === 'working' && 'shimmer')}>{entry.thread.title}</span>
									</span>
									{query && parent && <span className="truncate pl-4 text-xs text-muted-foreground">in {parent.title}</span>}
								</>
							) : (
								<span className="text-muted-foreground">{first}</span>
							)}
						</button>
					);
				})}
				{entries.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">No Thread matches</p>}
			</div>
		</div>
	);
}
