import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {FileTextIcon, ListChecksIcon, XIcon} from 'lucide-react';
import type {CSSProperties} from 'react';
import {cn} from '@/lib/utils';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import type {Task} from '../../src/core/task';
import {Deadline} from './Deadline';
import {dayName} from './days';

// A Task's title reads the same whether it is shown or being edited. The
// input's own md:text-sm would otherwise make it smaller on wide screens.
export const titleClass = 'font-sans text-[0.9375rem] leading-6 md:text-[0.9375rem]';
// An open Task in Someday has a dashed box, so it reads as not in play.
export const somedayBox = (task: Task) => (task.when.kind === 'someday' && task.ended === 'not_ended' ? 'border-dashed border-foreground/60' : undefined);
export const bareInput = 'h-auto min-w-0 flex-1 rounded-none border-none bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent';

// Small marks for what an open Task would show: Notes, Checklist progress,
// its Date in Upcoming and its Deadline.
function Meta({task, view}: {task: Task; view: string}) {
	const ticked = task.checklist.filter(s => s.done).length;
	return (
		<span className="flex shrink-0 items-center gap-3 text-muted-foreground">
			{task.notes && <FileTextIcon className="size-3.5" />}
			{task.checklist.length > 0 && (
				<span className="flex items-center gap-1 text-xs tabular-nums">
					<ListChecksIcon className="size-3.5" />
					{ticked}/{task.checklist.length}
				</span>
			)}
			{view !== 'upcoming' && view !== 'today' && task.when.kind === 'on_day' && <span className="text-xs">{dayName(task.when.day)}</span>}
			{task.deadline.kind === 'by_day' && task.ended === 'not_ended' && <Deadline day={task.deadline.day} />}
		</span>
	);
}

function TitleInput({value, onDone}: {value: string; onDone: (title: string | null) => void}) {
	return (
		<Input
			autoFocus
			defaultValue={value}
			className={cn(bareInput, titleClass)}
			onKeyDown={e => {
				if (e.key === 'Enter') onDone(e.currentTarget.value);
				if (e.key === 'Escape') onDone(null);
			}}
			onBlur={e => onDone(e.currentTarget.value)}
		/>
	);
}

export function TaskRow({
	task,
	view,
	away,
	dimmed,
	selected,
	renaming,
	draggable,
	sortable,
	onSelect,
	onOpen,
	onTick,
	onRename,
}: {
	task: Task;
	view: string;
	// How it steps back while another Task is open.
	away: CSSProperties;
	dimmed: boolean;
	selected: boolean;
	renaming: boolean;
	// Whether it can be dragged at all, and whether the list makes room for
	// it as it moves. Upcoming is in date order, so its rows only go to the
	// sidebar.
	draggable: boolean;
	sortable: boolean;
	onSelect: (e: React.MouseEvent) => void;
	onOpen: () => void;
	onTick: () => void;
	onRename: (title: string | null) => void;
}) {
	const ended = task.ended !== 'not_ended';
	const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id: task.id, disabled: !draggable || renaming});
	return (
		<div
			ref={setNodeRef}
			// While dragged, the drag places it; otherwise it steps back as asked,
			// keeping its own dimming when it does not.
			style={sortable && transform ? {transform: CSS.Translate.toString(transform), transition} : {...away, opacity: away.opacity === 1 ? undefined : away.opacity}}
			{...attributes}
			{...listeners}
			data-task={task.id}
			data-row={task.id}
			onClick={onSelect}
			onDoubleClick={onOpen}
			// Right-clicking a Task outside the selection acts on that Task alone.
			onContextMenu={e => !selected && onSelect(e)}
			className={cn(
				'flex cursor-default touch-manipulation items-center gap-3 rounded-lg px-2 py-1.5 outline-none select-none',
				selected ? 'bg-accent' : 'hover:bg-muted/50',
				(dimmed || isDragging) && 'opacity-40',
			)}
		>
			{task.ended === 'dropped' ? (
				<button
					onPointerDown={e => e.stopPropagation()}
					className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border text-muted-foreground"
					onClick={e => {
						e.stopPropagation();
						onTick();
					}}
					aria-label="Open again"
				>
					<XIcon className="size-3" />
				</button>
			) : (
				<Checkbox
					className={somedayBox(task)}
					checked={ended}
					onCheckedChange={onTick}
					onClick={e => e.stopPropagation()}
					onPointerDown={e => e.stopPropagation()}
					aria-label={ended ? 'Open again' : 'Done'} />
			)}
			{renaming ? (
				<TitleInput value={task.title} onDone={onRename} />
			) : (
				<span className={cn('min-w-0 flex-1 truncate', titleClass, ended && 'text-muted-foreground line-through')}>{task.title}</span>
			)}
			<Meta task={task} view={view} />
		</div>
	);
}
