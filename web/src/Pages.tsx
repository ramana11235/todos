// Projects and areas in the web app: their entries in the sidebar, their
// heading over the Tasks in a list, and the top of the page each opens.
import {useState, type CSSProperties, type MouseEvent, type ReactNode} from 'react';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {BoxIcon, CheckIcon, CircleIcon, FlagIcon, RotateCcwIcon} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {SidebarGroup, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar} from '@/components/ui/sidebar';
import {sameBelongs, type Area, type Belonging, type Belongs, type InArea, type Project} from '../../src/core/project';
import type {AreaEdit, ProjectEdit} from '../../src/core/projects';
import type {Deadline as DeadlineDay} from '../../src/core/thread';
import {deadlineName} from '../../src/core/words';
import {daysLeft, today} from './days';
import {Deadline, DeadlinePicker} from './Deadline';
import {Field} from './Threads';

export type Page = {kind: 'project' | 'area'; id: string};

const iconOf = (kind: Page['kind']) => (kind === 'area' ? BoxIcon : CircleIcon);
const colourOf = (kind: Page['kind']) => (kind === 'area' ? 'var(--icon-mid)' : 'var(--icon-bright)');

// An area reads as the heading of the projects under it, which sit level
// with it rather than indented. A project's Deadline shows on the right,
// worded and coloured as a Task's is.
//
// A project is dragged by its row, and makes room as others are dragged
// past it. An area's row makes room too, but is dragged with its whole
// group, so handle carries that group's drag. picked shows it is among the
// projects picked with shift- or cmd-click.
export function PageItem({page, title, active, picked = false, deadline = {kind: 'none'}, onClick, handle}: {
	page: Page; title: string; active: boolean; picked?: boolean; deadline?: DeadlineDay;
	onClick: (page: Page, e: MouseEvent) => void; handle?: object;
}) {
	const {setOpenMobile} = useSidebar();
	const {attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, active: drag} = useSortable({
		id: sortableId(page.kind === 'area' ? 'head' : 'project', page.id),
		disabled: page.kind === 'area' ? {draggable: true} : false,
	});
	// A Task dragged over it shows it will take the Task, as a list does.
	const takesTask = isOver && drag !== null && sortableOf(String(drag.id)).kind === 'other';
	const Icon = iconOf(page.kind);
	return (
		<SidebarMenuItem ref={setNodeRef} style={{transform: CSS.Translate.toString(transform), transition}} className={cn(isDragging && 'opacity-40')}>
			<SidebarMenuButton
				{...(page.kind === 'area' ? handle : {...attributes, ...listeners})}
				isActive={active}
				className={cn('touch-manipulation', page.kind === 'area' && 'font-semibold', picked && !active && 'bg-sidebar-accent/60', takesTask && 'ring-2 ring-primary')}
				onClick={e => {
					onClick(page, e);
					if (!e.shiftKey && !e.metaKey && !e.ctrlKey) setOpenMobile(false);
				}}
			>
				<Icon style={{color: colourOf(page.kind)}} />
				<span>{title}</span>
			</SidebarMenuButton>
			{deadline.kind === 'by_day' && (
				<SidebarMenuBadge className={cn(daysLeft(deadline.day) > 1 && 'text-muted-foreground')} style={daysLeft(deadline.day) <= 1 ? {color: 'var(--deadline)'} : undefined}>
					{deadlineName(deadline.day, today())}
				</SidebarMenuBadge>
			)}
		</SidebarMenuItem>
	);
}

// An area and its projects, dragged together by the area's row so they move
// as one block while the other areas glide past.
export function AreaGroup({id, children}: {id: string; children: (handle: object) => ReactNode}) {
	const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id: sortableId('area', id)});
	return (
		<SidebarGroup ref={setNodeRef} style={{transform: CSS.Translate.toString(transform), transition}} className={cn(isDragging && 'opacity-40')}>
			<SidebarMenu>{children({...attributes, ...listeners})}</SidebarMenu>
		</SidebarGroup>
	);
}

// The ids rows are dragged and dropped by, apart from Tasks' ids: a project,
// an area's row as a place to drop projects, and an area's whole group.
export type SortableKind = 'project' | 'head' | 'area';
export const sortableId = (kind: SortableKind, id: string) => `${kind}:${id}`;
// Anything else, such as a Task or a list, is other.
export function sortableOf(sortable: string): {kind: SortableKind; id: string} | {kind: 'other'} {
	const [kind, ...rest] = sortable.split(':');
	return kind === 'project' || kind === 'head' || kind === 'area' ? {kind, id: rest.join(':')} : {kind: 'other'};
}

// A heading over the Tasks of one project or area in a list, naming the
// area before the project. It opens that page.
export function BelongingHeading({belonging, row, style, onOpen}: {belonging: Belonging; row: string; style: CSSProperties; onOpen: (page: Page) => void}) {
	const {belongs, path, ended} = belonging;
	if (belongs.kind === 'none') return null;
	const Icon = iconOf(belongs.kind);
	return (
		<h2 data-row={row} style={style} className="mt-10 mb-1 border-b pb-1.5 text-base font-semibold first:mt-0">
			<button className="flex items-center gap-2 hover:text-(--icon-bright)" onClick={() => onOpen(belongs)}>
				<Icon className="size-4" style={{color: colourOf(belongs.kind)}} />
				{path.length > 1 && <span className="font-normal text-muted-foreground">{path[0]} ›</span>}
				<span className={cn(ended !== 'not_ended' && 'text-muted-foreground line-through')}>{path.at(-1)}</span>
				{ended !== 'not_ended' && <span className="text-xs font-normal text-muted-foreground">{ended}</span>}
			</button>
		</h2>
	);
}

// The top of a project's or an area's page: its title and Notes to edit in
// place, a project's area and Deadline, the projects in an area, and the
// buttons that end it or open it again.
export function PageTop({page, areas, projects, onOpen, onEditProject, onEditArea, onEnd}: {
	page: Page;
	areas: Area[];
	projects: Project[];
	onOpen: (page: Page) => void;
	onEditProject: (id: string, edit: ProjectEdit) => void;
	onEditArea: (id: string, edit: AreaEdit) => void;
	onEnd: (how: 'done' | 'dropped' | 'not_ended') => void;
}) {
	const [open, setOpen] = useState<'area' | 'deadline' | null>(null);
	const project = page.kind === 'project' ? projects.find(p => p.id === page.id) : undefined;
	const area = page.kind === 'area' ? areas.find(a => a.id === page.id) : undefined;
	const shown = project ?? area;
	// Not loaded yet, or gone from a saved link.
	if (!shown) return <p className="mb-8 text-sm text-muted-foreground">Nothing here.</p>;
	const ended = shown.ended !== 'not_ended';
	const Icon = iconOf(page.kind);
	const edit = (change: ProjectEdit & AreaEdit) => (project ? onEditProject(project.id, change) : onEditArea(shown.id, {title: change.title, notes: change.notes}));
	const inArea = project?.area.kind === 'in' ? areas.find(a => a.id === (project.area as {id: string}).id) : undefined;
	const inside = area ? projects.filter(p => p.area.kind === 'in' && p.area.id === area.id) : [];
	return (
		<div className="mb-8 flex flex-col gap-3">
			{inArea && (
				<button className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground" onClick={() => onOpen({kind: 'area', id: inArea.id})}>
					<BoxIcon className="size-3.5" />
					{inArea.title}
				</button>
			)}
			<div className="flex items-center gap-3">
				<Icon className="size-6 shrink-0" style={{color: colourOf(page.kind)}} />
				<Field
					key={shown.id}
					value={shown.title}
					placeholder="Title"
					required
					className={cn('font-heading text-2xl font-semibold tracking-tight md:text-2xl', ended && 'text-muted-foreground line-through')}
					onSave={title => edit({title: title.trim()})}
				/>
			</div>
			<Field key={`notes-${shown.id}`} value={shown.notes} placeholder="Notes" multiline onSave={notes => edit({notes})} />
			<div className="-ml-2 flex flex-wrap items-center gap-1">
				{ended ? (
					<Button variant="ghost" size="sm" onClick={() => onEnd('not_ended')}>
						<RotateCcwIcon data-icon="inline-start" />
						{shown.ended === 'done' ? 'Done' : 'Dropped'} · reopen
					</Button>
				) : (
					<>
						{project && (
							<Button variant="ghost" size="sm" onClick={() => onEnd('done')}>
								<CheckIcon data-icon="inline-start" />
								Mark Done
							</Button>
						)}
						<Button variant="ghost" size="sm" onClick={() => onEnd('dropped')}>
							Drop
						</Button>
					</>
				)}
				{project && (
					<>
						<Popover open={open === 'area'} onOpenChange={isOpen => setOpen(isOpen ? 'area' : null)}>
							<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
								<BoxIcon data-icon="inline-start" />
								{inArea ? inArea.title : 'No area'}
							</PopoverTrigger>
							<PopoverContent className="w-56 p-1" align="start">
								{[null, ...areas.filter(a => a.ended === 'not_ended' || a.id === inArea?.id)].map(choice => {
									const next: InArea = choice ? {kind: 'in', id: choice.id} : {kind: 'none'};
									return (
										<Button
											key={choice?.id ?? 'none'}
											variant="ghost"
											className="w-full justify-start"
											onClick={() => {
												setOpen(null);
												onEditProject(project.id, {area: next});
											}}
										>
											{choice ? choice.title : 'No area'}
											{(choice?.id ?? null) === (inArea?.id ?? null) && <CheckIcon className="ml-auto" />}
										</Button>
									);
								})}
							</PopoverContent>
						</Popover>
						<Popover open={open === 'deadline'} onOpenChange={isOpen => setOpen(isOpen ? 'deadline' : null)}>
							<PopoverTrigger render={<Button variant="ghost" size="sm" />}>
								{project.deadline.kind === 'by_day' ? (
									<Deadline day={project.deadline.day} />
								) : (
									<>
										<FlagIcon data-icon="inline-start" />
										Deadline
									</>
								)}
							</PopoverTrigger>
							<PopoverContent className="w-auto p-1" align="start">
								<DeadlinePicker
									deadline={project.deadline}
									onChange={deadline => {
										setOpen(null);
										onEditProject(project.id, {deadline});
									}}
								/>
							</PopoverContent>
						</Popover>
					</>
				)}
			</div>
			{inside.length > 0 && (
				<div className="mt-3 flex flex-col">
					<h2 className="mb-1 border-b pb-1 text-sm font-semibold">Projects</h2>
					{inside.map(p => (
						<button key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => onOpen({kind: 'project', id: p.id})}>
							<CircleIcon className="size-3.5" style={{color: 'var(--icon-bright)'}} />
							<span className={cn(p.ended !== 'not_ended' && 'text-muted-foreground line-through')}>{p.title}</span>
							{p.deadline.kind === 'by_day' && <Deadline day={p.deadline.day} />}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// Asks before ending a project or dropping an area that still has open work
// inside, and names it. Ending it leaves that work as it is.
export function ConfirmEnd({ending, onCancel, onConfirm}: {
	ending: {title: string; how: 'done' | 'dropped'; open: string[]} | null;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const verb = ending?.how === 'done' ? 'Mark Done' : 'Drop';
	return (
		<Dialog open={ending !== null} onOpenChange={isOpen => !isOpen && onCancel()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{ending?.how === 'done' ? 'Mark' : 'Drop'} "{ending?.title}"{ending?.how === 'done' ? ' Done' : ''}?
					</DialogTitle>
					<DialogDescription>These are still open inside it, and stay as they are:</DialogDescription>
				</DialogHeader>
				<ul className="list-disc pl-5 text-sm">
					{ending?.open.map((title, i) => <li key={i}>{title}</li>)}
				</ul>
				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>Cancel</Button>
					<Button onClick={onConfirm}>{verb}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// Names a new project or area, as Capture names a new Task: Enter makes it,
// Esc cancels.
export function NewPage({kind, onDone}: {kind: Page['kind'] | null; onDone: (title: string | null) => void}) {
	return (
		<Dialog open={kind !== null} onOpenChange={isOpen => !isOpen && onDone(null)}>
			<DialogContent showCloseButton={false} className="top-[30%] gap-2 p-3">
				<DialogTitle className="sr-only">{kind === 'area' ? 'New area' : 'New project'}</DialogTitle>
				<Input
					autoFocus
					placeholder={kind === 'area' ? 'New area' : 'New project'}
					className="border-none text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
					onKeyDown={e => {
						if (e.key === 'Enter' && e.currentTarget.value.trim()) onDone(e.currentTarget.value.trim());
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

// Picks the project or area something belongs to, or nothing, as
// ThreadPicker picks a Thread: in the sidebar's order until I type, then the
// matches. Ended ones are left out, apart from the one it is in now.
export function BelongsPicker({order, start, onPick}: {order: Belonging[]; start: Belongs; onPick: (belongs: Belongs) => void}) {
	const [query, setQuery] = useState('');
	const open = order.filter(one => one.ended === 'not_ended' || sameBelongs(one.belongs, start));
	const matches = query ? open.filter(one => one.path.join(' ').toLowerCase().includes(query.toLowerCase())) : open;
	const entries: Belonging[] = query ? matches : [{belongs: {kind: 'none'}, path: [], ended: 'not_ended'}, ...matches];
	const [at, setAt] = useState(() => Math.max(0, entries.findIndex(one => sameBelongs(one.belongs, start))));
	return (
		<div className="flex flex-col gap-1">
			<Input
				autoFocus
				placeholder="Find a project or area"
				value={query}
				onChange={e => {
					setQuery(e.target.value);
					setAt(0);
				}}
				onKeyDown={e => {
					if (e.key === 'ArrowDown') setAt(a => Math.min(entries.length - 1, a + 1));
					else if (e.key === 'ArrowUp') setAt(a => Math.max(0, a - 1));
					else if (e.key === 'Enter' && entries[at]) onPick(entries[at].belongs);
					else return;
					e.preventDefault();
				}}
			/>
			<div className="flex max-h-72 flex-col overflow-y-auto">
				{entries.map((one, i) => {
					const Icon = one.belongs.kind === 'none' ? null : iconOf(one.belongs.kind);
					return (
						<button
							key={one.belongs.kind === 'none' ? 'none' : one.belongs.id}
							className={cn('flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm', i === at && 'bg-accent')}
							onMouseEnter={() => setAt(i)}
							onClick={() => onPick(one.belongs)}
						>
							{Icon && one.belongs.kind !== 'none' ? (
								<>
									<Icon className="size-3.5 shrink-0" style={{color: colourOf(one.belongs.kind)}} />
									<span className={cn('truncate', one.belongs.kind === 'area' && 'font-semibold')}>{one.path.at(-1)}</span>
									{one.path.length > 1 && <span className="truncate text-xs text-muted-foreground">in {one.path[0]}</span>}
								</>
							) : (
								<span className="text-muted-foreground">Nothing</span>
							)}
						</button>
					);
				})}
				{entries.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">No project or area matches</p>}
			</div>
		</div>
	);
}

// What something belongs to, as a button's label.
export const belongingLabel = (belongs: Belongs, order: Belonging[]) => order.find(one => sameBelongs(one.belongs, belongs))?.path.join(' › ');
