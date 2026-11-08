import {useState} from 'react';
import {BanIcon, BellIcon, BoxIcon, CalendarIcon, CheckIcon, FlagIcon, NetworkIcon, XIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogTitle} from '@/components/ui/dialog';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
} from '@/components/ui/context-menu';
import type {Belonging, Belongs} from '../../src/core/project';
import type {TaskEdit} from '../../src/core/tasks';
import {BelongsPicker} from './Pages';
import {DeadlinePicker} from './Deadline';
import {ReminderPicker} from './Reminders';
import type {Reminder} from '../../src/core/reminder';
import {ThreadPicker} from './ThreadPicker';
import {WhenPicker} from './When';
import type {Deadline, Thread} from '../../src/core/thread';

// What can be done to the selected Tasks all at once.
export type Actions = {
	when: (edit: TaskEdit) => void;
	deadline: (deadline: Deadline) => void;
	reminder: (reminder: Reminder) => void;
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
	const [open, setOpen] = useState<'when' | 'reminder' | 'deadline' | 'thread' | 'belongs' | null>(null);
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
				<Popover open={open === 'reminder'} onOpenChange={o => setOpen(o ? 'reminder' : null)}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="Remind me" />}>
						<BellIcon data-icon="inline-start" />
						<span className="max-md:hidden">Remind me</span>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-1" side="top">
						<ReminderPicker reminder={{kind: 'none'}} onChange={given => then(() => actions.reminder(given))} />
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

// The right-click menu, with everything the bar at the bottom can do. Each
// item names its action, and the ones that need a choice open the bar's own
// picker in a dialog, as / does on the Threads page, because a menu has no
// room for a calendar or a search.
export function TaskMenu({actions, threads, order, onTurnIntoThread}: {
	actions: Actions;
	threads: Thread[];
	order: Belonging[];
	// Only for a single Task.
	onTurnIntoThread?: (parentId: string | null) => void;
}) {
	const [picking, setPicking] = useState<'when' | 'reminder' | 'deadline' | 'thread' | 'belongs' | 'turn' | null>(null);
	const then = (run: () => void) => {
		setPicking(null);
		run();
	};
	const title = {when: 'Set a day', reminder: 'Set a reminder', deadline: 'Set a deadline', thread: 'Link to a Thread', belongs: 'Put in a project or area', turn: 'Turn into a Thread'};
	return (
		<>
			<ContextMenuContent>
				<ContextMenuGroup>
					<ContextMenuItem onClick={() => setPicking('when')}>{title.when}</ContextMenuItem>
					<ContextMenuItem onClick={() => setPicking('reminder')}>{title.reminder}</ContextMenuItem>
					<ContextMenuItem onClick={() => setPicking('deadline')}>{title.deadline}</ContextMenuItem>
					<ContextMenuItem onClick={() => setPicking('thread')}>{title.thread}</ContextMenuItem>
					<ContextMenuItem onClick={() => setPicking('belongs')}>{title.belongs}</ContextMenuItem>
					{onTurnIntoThread && <ContextMenuItem onClick={() => setPicking('turn')}>{title.turn}</ContextMenuItem>}
				</ContextMenuGroup>
				<ContextMenuSeparator />
				<ContextMenuGroup>
					<ContextMenuItem onClick={actions.tick}>Tick off</ContextMenuItem>
					<ContextMenuItem onClick={actions.drop}>Drop</ContextMenuItem>
				</ContextMenuGroup>
			</ContextMenuContent>
			<Dialog open={picking !== null} onOpenChange={open => !open && setPicking(null)}>
				<DialogContent showCloseButton={false} className={picking === 'when' || picking === 'reminder' || picking === 'deadline' ? 'w-auto p-1' : 'top-[30%] p-2'}>
					<DialogTitle className="sr-only">{picking ? title[picking] : ''}</DialogTitle>
					{picking === 'when' ? (
						<WhenPicker task={null} inbox onEdit={edit => then(() => actions.when(edit))} />
					) : picking === 'reminder' ? (
						<ReminderPicker reminder={{kind: 'none'}} onChange={given => then(() => actions.reminder(given))} />
					) : picking === 'deadline' ? (
						<DeadlinePicker deadline={{kind: 'none'}} onChange={given => then(() => actions.deadline(given))} />
					) : picking === 'belongs' ? (
						<BelongsPicker order={order} start={{kind: 'none'}} onPick={belongs => then(() => actions.belongs(belongs))} />
					) : picking === 'turn' ? (
						<>
							<p className="px-2 pt-1 pb-1 text-xs font-medium text-muted-foreground">Put the new Thread in</p>
							<ThreadPicker threads={threads} first="Top level" onPick={parentId => then(() => onTurnIntoThread?.(parentId))} />
						</>
					) : (
						<ThreadPicker threads={threads} first="None" onPick={id => then(() => actions.thread(id))} />
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
