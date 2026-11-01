import {useState} from 'react';
import {BanIcon, BoxIcon, CalendarIcon, CheckIcon, FlagIcon, NetworkIcon, XIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogTitle} from '@/components/ui/dialog';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type {Belonging, Belongs} from '../../src/core/project';
import type {TaskEdit} from '../../src/core/tasks';
import {BelongsPicker} from './Pages';
import {DeadlinePicker} from './Deadline';
import {addDays, today} from './days';
import {ThreadPicker} from './ThreadPicker';
import {WhenPicker} from './When';
import type {Deadline, Thread} from '../../src/core/thread';

// What can be done to the selected Tasks all at once.
export type Actions = {
	when: (edit: TaskEdit) => void;
	deadline: (deadline: Deadline) => void;
	// Links them all to a Thread, or to none.
	thread: (id: string | null) => void;
	// Puts them all in a project or area, or in neither.
	belongs: (belongs: Belongs) => void;
	tick: () => void;
	drop: () => void;
};

// Shown at the bottom while several Tasks are selected. On a phone the
// buttons show only their icons, so the bar fits the width.
export function SelectionBar({count, actions, threads, order, onClear}: {count: number; actions: Actions; threads: Thread[]; order: Belonging[]; onClear: () => void}) {
	const [open, setOpen] = useState<'when' | 'deadline' | 'thread' | 'belongs' | null>(null);
	const then = (run: () => void) => {
		setOpen(null);
		run();
	};
	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-10 flex justify-center px-4">
			<div className="pointer-events-auto flex items-center gap-1 rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl">
				<span className="px-2 text-sm tabular-nums">
					{count}
					<span className="max-md:hidden"> selected</span>
				</span>
				<Popover open={open === 'when'} onOpenChange={o => setOpen(o ? 'when' : null)}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="When" />}>
						<CalendarIcon data-icon="inline-start" />
						<span className="max-md:hidden">When</span>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-1" side="top">
						<WhenPicker task={null} inbox onEdit={edit => then(() => actions.when(edit))} />
					</PopoverContent>
				</Popover>
				<Popover open={open === 'deadline'} onOpenChange={o => setOpen(o ? 'deadline' : null)}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="Deadline" />}>
						<FlagIcon data-icon="inline-start" />
						<span className="max-md:hidden">Deadline</span>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-1" side="top">
						<DeadlinePicker deadline={{kind: 'none'}} onChange={given => then(() => actions.deadline(given))} />
					</PopoverContent>
				</Popover>
				<Popover open={open === 'thread'} onOpenChange={o => setOpen(o ? 'thread' : null)}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="Thread" />}>
						<NetworkIcon data-icon="inline-start" />
						<span className="max-md:hidden">Thread</span>
					</PopoverTrigger>
					<PopoverContent className="w-80 p-1.5" side="top">
						<ThreadPicker threads={threads} first="None" onPick={id => then(() => actions.thread(id))} />
					</PopoverContent>
				</Popover>
				<Popover open={open === 'belongs'} onOpenChange={o => setOpen(o ? 'belongs' : null)}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="Project or area" />}>
						<BoxIcon data-icon="inline-start" />
						<span className="max-md:hidden">Project</span>
					</PopoverTrigger>
					<PopoverContent className="w-80 p-1.5" side="top">
						<BelongsPicker order={order} start={{kind: 'none'}} onPick={belongs => then(() => actions.belongs(belongs))} />
					</PopoverContent>
				</Popover>
				<Button variant="ghost" size="sm" onClick={actions.tick} aria-label="Tick off">
					<CheckIcon data-icon="inline-start" />
					<span className="max-md:hidden">Tick off</span>
				</Button>
				<Button variant="ghost" size="sm" onClick={actions.drop} aria-label="Drop">
					<BanIcon data-icon="inline-start" />
					<span className="max-md:hidden">Drop</span>
				</Button>
				<Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
					<XIcon />
				</Button>
			</div>
		</div>
	);
}

// The right-click menu, with the same actions and the usual days at hand.
// Thread… and Project… open their pickers in a dialog, as / does on the
// Threads page, because a menu has no room to search in.
export function TaskMenu({actions, threads, order}: {actions: Actions; threads: Thread[]; order: Belonging[]}) {
	const [picking, setPicking] = useState<'thread' | 'belongs' | null>(null);
	const now = today();
	const when: [string, TaskEdit][] = [
		['Today', {when: {kind: 'today'}}],
		['Tomorrow', {when: {kind: 'on_day', day: addDays(now, 1)}}],
		['Next week', {when: {kind: 'on_day', day: addDays(now, 7)}}],
		['Anytime', {when: {kind: 'anytime'}}],
		['Someday', {when: {kind: 'someday'}}],
		['Inbox', {when: {kind: 'inbox'}}],
	];
	const deadline: [string, Deadline][] = [
		['Today', {kind: 'by_day', day: now}],
		['Tomorrow', {kind: 'by_day', day: addDays(now, 1)}],
		['In a week', {kind: 'by_day', day: addDays(now, 7)}],
		['Clear', {kind: 'none'}],
	];
	return (
		<>
			<ContextMenuContent>
				<ContextMenuGroup>
					<ContextMenuSub>
						<ContextMenuSubTrigger>When</ContextMenuSubTrigger>
						<ContextMenuSubContent>
							<ContextMenuGroup>
								{when.map(([label, edit]) => (
									<ContextMenuItem key={label} onClick={() => actions.when(edit)}>
										{label}
									</ContextMenuItem>
								))}
							</ContextMenuGroup>
						</ContextMenuSubContent>
					</ContextMenuSub>
					<ContextMenuSub>
						<ContextMenuSubTrigger>Deadline</ContextMenuSubTrigger>
						<ContextMenuSubContent>
							<ContextMenuGroup>
								{deadline.map(([label, given]) => (
									<ContextMenuItem key={label} onClick={() => actions.deadline(given)}>
										{label}
									</ContextMenuItem>
								))}
							</ContextMenuGroup>
						</ContextMenuSubContent>
					</ContextMenuSub>
					<ContextMenuItem onClick={() => setPicking('thread')}>Thread…</ContextMenuItem>
					<ContextMenuItem onClick={() => setPicking('belongs')}>Project or area…</ContextMenuItem>
				</ContextMenuGroup>
				<ContextMenuSeparator />
				<ContextMenuGroup>
					<ContextMenuItem onClick={actions.tick}>Tick off</ContextMenuItem>
					<ContextMenuItem onClick={actions.drop}>Drop</ContextMenuItem>
				</ContextMenuGroup>
			</ContextMenuContent>
			<Dialog open={picking !== null} onOpenChange={open => !open && setPicking(null)}>
				<DialogContent showCloseButton={false} className="top-[30%] p-2">
					<DialogTitle className="sr-only">{picking === 'belongs' ? 'Put in a project or area' : 'Link to a Thread'}</DialogTitle>
					{picking === 'belongs' ? (
						<BelongsPicker
							order={order}
							start={{kind: 'none'}}
							onPick={belongs => {
								setPicking(null);
								actions.belongs(belongs);
							}}
						/>
					) : (
						<ThreadPicker
							threads={threads}
							first="None"
							onPick={id => {
								setPicking(null);
								actions.thread(id);
							}}
						/>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
