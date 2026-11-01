import {useState} from 'react';
import {FlagIcon, NetworkIcon} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {Textarea} from '@/components/ui/textarea';
import type {Belongs} from '../../src/core/project';
import {listNames, type TaskWhen} from '../../src/core/task';
import type {Deadline as TaskDeadline, Thread} from '../../src/core/thread';
import {Deadline, DeadlinePicker} from './Deadline';
import {dayName} from './days';
import {bareInput, titleClass} from './TaskRow';
import {ThreadPicker} from './ThreadPicker';
import {placeIcons, WhenPicker} from './When';

// A Task before it is saved, placed where I was unless I pick otherwise.
// A Task started on a project's or area's page belongs to it.
export type Draft = {title: string; notes: string; when: TaskWhen; deadline: TaskDeadline; threadId: string | null; belongs: Belongs};

// A new Task opens with the same details an existing one has, so it can be
// placed while it is written: When, Deadline and its Thread. Enter in the
// title saves it, and Esc, or Enter with no title, drops it.
export function NewTask({start, threads, onDone}: {start: Draft; threads: Thread[]; onDone: (draft: Draft | null) => void}) {
	const [draft, setDraft] = useState(start);
	const [open, setOpen] = useState<'when' | 'deadline' | 'thread' | null>(null);
	const set = (patch: Partial<Draft>) => {
		setDraft(d => ({...d, ...patch}));
		setOpen(null);
	};
	const thread = threads.find(t => t.id === draft.threadId);
	const [WhenIcon, whenColour] = placeIcons[draft.when.kind === 'on_day' ? 'upcoming' : draft.when.kind];
	return (
		<div
			className="my-2 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg"
			onKeyDown={e => {
				if (e.key === 'Escape' && !open) {
					e.stopPropagation();
					onDone(null);
				}
			}}
		>
			<div className="flex items-center gap-3">
				<Checkbox disabled aria-hidden />
				<Input
					autoFocus
					placeholder="New task"
					value={draft.title}
					className={cn(bareInput, titleClass)}
					onChange={e => setDraft(d => ({...d, title: e.target.value}))}
					onKeyDown={e => e.key === 'Enter' && onDone(draft.title.trim() ? {...draft, title: draft.title.trim()} : null)}
				/>
			</div>
			<Textarea
				placeholder="Notes"
				value={draft.notes}
				className={cn(bareInput, 'min-h-10 resize-none pl-7 text-sm md:text-sm')}
				onChange={e => setDraft(d => ({...d, notes: e.target.value}))}
			/>
			<div className="flex flex-wrap items-center gap-1 pl-5 max-md:pl-0">
				<Popover open={open === 'when'} onOpenChange={o => setOpen(o ? 'when' : null)}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
						<WhenIcon data-icon="inline-start" style={{color: whenColour}} />
						{draft.when.kind === 'on_day' ? dayName(draft.when.day) : listNames[draft.when.kind]}
					</PopoverTrigger>
					<PopoverContent className="w-auto p-1" align="start">
						<WhenPicker task={null} inbox onEdit={edit => set({when: edit.when ?? draft.when})} />
					</PopoverContent>
				</Popover>
				<Popover open={open === 'deadline'} onOpenChange={o => setOpen(o ? 'deadline' : null)}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
						{draft.deadline.kind === 'by_day' ? (
							<Deadline day={draft.deadline.day} />
						) : (
							<>
								<FlagIcon data-icon="inline-start" />
								Deadline
							</>
						)}
					</PopoverTrigger>
					<PopoverContent className="w-auto p-1" align="start">
						<DeadlinePicker deadline={draft.deadline} onChange={deadline => set({deadline})} />
					</PopoverContent>
				</Popover>
				<Popover open={open === 'thread'} onOpenChange={o => setOpen(o ? 'thread' : null)}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" className="max-w-64" />}>
						<NetworkIcon data-icon="inline-start" />
						<span className="truncate">{thread ? thread.title : 'Thread'}</span>
					</PopoverTrigger>
					<PopoverContent className="w-80 p-1.5" align="start">
						<ThreadPicker threads={threads} first="None" start={draft.threadId} onPick={threadId => set(threadId ? {threadId, belongs: {kind: 'none'}} : {threadId})} />
					</PopoverContent>
				</Popover>
				<Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => onDone(null)}>
					Cancel
				</Button>
				<Button size="sm" disabled={!draft.title.trim()} onClick={() => onDone({...draft, title: draft.title.trim()})}>
					Add
				</Button>
			</div>
		</div>
	);
}
