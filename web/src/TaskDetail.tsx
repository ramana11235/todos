import {useState} from 'react';
import {BoxIcon, FlagIcon, MoreHorizontalIcon, NetworkIcon, PlusIcon, SplitIcon} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {listOf, type Step, type Task} from '../../src/core/task';
import type {Belonging} from '../../src/core/project';
import type {TaskEdit} from '../../src/core/tasks';
import {belongingLabel, BelongsPicker} from './Pages';
import type {Thread} from '../../src/core/thread';
import {Formatted} from './Formatted';
import {ThreadPicker} from './ThreadPicker';
import {Deadline, DeadlinePicker} from './Deadline';
import {bareInput as bare, titleClass} from './TaskRow';
import {today} from './days';
import {ease, ms} from './motion';
import {placeIcons, whenLabel, WhenPicker} from './When';


// The open Task, shown in place of its row: title, Notes, Checklist and its
// Deadline. Text is saved when it loses focus, everything else at once.
export function TaskDetail({
	task,
	threads,
	order,
	onEdit,
	onTick,
	onDrop,
	onClose,
	onTurnIntoThread,
}: {
	task: Task;
	threads: Thread[];
	order: Belonging[];
	onTurnIntoThread: (parentId: string | null) => void;
	onEdit: (edit: TaskEdit) => void;
	onTick: () => void;
	onDrop: () => void;
	onClose: () => void;
}) {
	const [whenOpen, setWhenOpen] = useState(false);
	// The Notes show their Markdown formatted until they are clicked.
	const [editingNotes, setEditingNotes] = useState(false);
	const [deadlineOpen, setDeadlineOpen] = useState(false);
	const [threadOpen, setThreadOpen] = useState(false);
	const [belongsOpen, setBelongsOpen] = useState(false);
	const [turnOpen, setTurnOpen] = useState(false);
	const thread = threads.find(t => t.id === task.threadId);
	const list = listOf(task, today());
	const [WhenIcon, whenColour] = placeIcons[list];
	const [focus, setFocus] = useState<string | null>(null);
	// A step being typed. The API refuses a step with no title, so it stays
	// on the page until it has one.
	const [draft, setDraft] = useState<(Step & {at: number}) | null>(null);
	const setSteps = (checklist: Step[]) => onEdit({checklist});
	const startDraft = (at: number) => {
		const id = crypto.randomUUID();
		setDraft({id, title: '', done: false, at});
		setFocus(id);
	};
	const steps = draft ? withStepAt(task.checklist, draft, draft.at) : task.checklist;

	return (
		<div
			data-task={task.id}
			data-row={task.id}
			className="my-2 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg"
			onKeyDown={e => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					(document.activeElement as HTMLElement | null)?.blur();
					onClose();
				}
			}}
		>
			<div className="flex items-start gap-3">
				<Checkbox className="mt-1" checked={task.ended === 'done'} onCheckedChange={onTick} aria-label="Done" />
				{/* The whole title, wrapped onto as many lines as it needs. It is
				    still one line of text, so Enter finishes and a pasted line
				    break becomes a space. */}
				<Textarea
					rows={1}
					defaultValue={task.title}
					className={cn(bare, titleClass, 'min-h-0 resize-none')}
					onInput={e => {
						const el = e.currentTarget;
						const before = el.offsetHeight;
						if (el.value.includes('\n')) el.value = el.value.replace(/\s*\n\s*/g, ' ');
						// A new line opens smoothly instead of jumping (docs/animation.md, "Nothing jumps").
						const after = el.offsetHeight;
						if (after !== before) el.animate([{height: `${before}px`}, {height: `${after}px`}], {duration: ms, easing: ease});
					}}
					onBlur={e => e.currentTarget.value.trim() && e.currentTarget.value.trim() !== task.title && onEdit({title: e.currentTarget.value.trim()})}
					onKeyDown={e => {
						if (e.key === 'Enter') {
							e.preventDefault();
							e.currentTarget.blur();
						}
					}}
				/>
			</div>
			{editingNotes ? (
				<Textarea
					autoFocus
					defaultValue={task.notes}
					placeholder="Notes"
					className={cn(bare, 'min-h-10 resize-none pl-7 text-sm md:text-sm')}
					onBlur={e => {
						setEditingNotes(false);
						if (e.currentTarget.value !== task.notes) onEdit({notes: e.currentTarget.value});
					}}
					onKeyDown={e => e.key === 'Escape' && e.currentTarget.blur()}
				/>
			) : (
				<Formatted text={task.notes} placeholder="Notes" className="min-h-10 pl-7" onEdit={() => setEditingNotes(true)} />
			)}
			{steps.length > 0 && (
				<div className="flex flex-col gap-1 pl-7">
					{steps.map((step, i) => {
						const isDraft = step.id === draft?.id;
						const saved = task.checklist.filter(s => s.id !== step.id);
						return (
							<div key={step.id} className="flex items-center gap-2 border-b border-border/60 pb-1">
								<Checkbox
									checked={step.done}
									disabled={isDraft}
									onCheckedChange={() => setSteps(task.checklist.map(s => (s.id === step.id ? {...s, done: !s.done} : s)))}
									aria-label="Step done"
								/>
								<Input
									autoFocus={focus === step.id}
									defaultValue={step.title}
									placeholder="Step"
									className={cn(bare, 'text-sm md:text-sm', step.done && 'text-muted-foreground line-through')}
									onBlur={e => {
										const title = e.currentTarget.value.trim();
										if (isDraft) {
											if (title) setSteps(withStepAt(saved, {...step, title}, i));
											setDraft(null);
										} else if (!title) setSteps(saved);
										else if (title !== step.title) setSteps(task.checklist.map(s => (s.id === step.id ? {...s, title} : s)));
									}}
									onKeyDown={e => {
										const title = e.currentTarget.value.trim();
										if (e.key === 'Enter' && title) {
											e.preventDefault();
											setSteps(isDraft ? withStepAt(saved, {...step, title}, i) : task.checklist.map(s => (s.id === step.id ? {...s, title} : s)));
											startDraft(i + 1);
										}
										if (e.key === 'Backspace' && e.currentTarget.value === '') {
											e.preventDefault();
											setFocus(steps[i - 1]?.id ?? null);
											if (isDraft) setDraft(null);
											else setSteps(saved);
										}
									}}
								/>
							</div>
						);
					})}
				</div>
			)}
			<div className="flex flex-wrap items-center gap-1 pl-5 max-md:pl-0">
				<Popover open={whenOpen} onOpenChange={setWhenOpen}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
						<WhenIcon data-icon="inline-start" style={{color: whenColour}} />
						{whenLabel(task)}
					</PopoverTrigger>
					<PopoverContent className="w-auto p-1" align="start">
						<WhenPicker
							task={task}
							onEdit={edit => {
								onEdit(edit);
								setWhenOpen(false);
							}}
						/>
					</PopoverContent>
				</Popover>
				<Popover open={deadlineOpen} onOpenChange={setDeadlineOpen}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
						{task.deadline.kind === 'by_day' ? (
							<Deadline day={task.deadline.day} />
						) : (
							<>
								<FlagIcon data-icon="inline-start" />
								Deadline
							</>
						)}
					</PopoverTrigger>
					<PopoverContent className="w-auto p-1" align="start">
						<DeadlinePicker
							deadline={task.deadline}
							onChange={deadline => {
								onEdit({deadline});
								setDeadlineOpen(false);
							}}
						/>
					</PopoverContent>
				</Popover>
				<Popover open={threadOpen} onOpenChange={setThreadOpen}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" className="max-w-64" />}>
						<NetworkIcon data-icon="inline-start" />
						<span className="truncate">{thread ? thread.title : 'Thread'}</span>
					</PopoverTrigger>
					<PopoverContent className="w-80 p-1.5" align="start">
						<ThreadPicker
							threads={threads}
							first="None"
							start={task.threadId}
							onPick={threadId => {
								// A Task links to one Thread, project or area at most.
								onEdit(threadId ? {threadId, belongs: {kind: 'none'}} : {threadId});
								setThreadOpen(false);
							}}
						/>
					</PopoverContent>
				</Popover>
				<Popover open={belongsOpen} onOpenChange={setBelongsOpen}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" className="max-w-64" />}>
						<BoxIcon data-icon="inline-start" />
						<span className="truncate">{belongingLabel(task.belongs, order) ?? 'Project'}</span>
					</PopoverTrigger>
					<PopoverContent className="w-80 p-1.5" align="start">
						<BelongsPicker
							order={order}
							start={task.belongs}
							onPick={belongs => {
								onEdit(belongs.kind === 'none' ? {belongs} : {belongs, threadId: null});
								setBelongsOpen(false);
							}}
						/>
					</PopoverContent>
				</Popover>
				<Popover open={turnOpen} onOpenChange={setTurnOpen}>
					<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
						<SplitIcon data-icon="inline-start" />
						Turn into Thread
					</PopoverTrigger>
					<PopoverContent className="w-80 p-1.5" align="start">
						<p className="px-2 pt-1 pb-1 text-xs font-medium text-muted-foreground">Put the new Thread in</p>
						<ThreadPicker
							threads={threads}
							first="Top level"
							start={task.threadId}
							onPick={parentId => {
								setTurnOpen(false);
								onTurnIntoThread(parentId);
							}}
						/>
					</PopoverContent>
				</Popover>
				{steps.length === 0 && (
					<Button variant="ghost" size="sm" onClick={() => startDraft(0)}>
						<PlusIcon data-icon="inline-start" />
						Checklist
					</Button>
				)}
				<DropdownMenu>
					<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="More" />}>
						<MoreHorizontalIcon />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							{list !== 'inbox' && <DropdownMenuItem onClick={() => onEdit({when: {kind: 'inbox'}})}>Move to Inbox</DropdownMenuItem>}
							<DropdownMenuItem onClick={onDrop}>Drop</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

function withStepAt(steps: Step[], step: Step, at: number): Step[] {
	const {id, title, done} = step;
	return [...steps.slice(0, at), {id, title, done}, ...steps.slice(at)];
}
