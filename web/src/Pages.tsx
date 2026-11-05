// Projects and areas in the web app: their entries in the sidebar, their
// heading over the Tasks in a list, and the top of the page each opens.
import {createContext, useContext, useState, type CSSProperties, type MouseEvent, type ReactNode} from 'react';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {BoxIcon, CheckIcon, FlagIcon, MoreHorizontalIcon, RotateCcwIcon, XIcon} from 'lucide-react';
import {Calendar} from '@/components/ui/calendar';
import {DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {SidebarGroup, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar} from '@/components/ui/sidebar';
import {sameBelongs, type Area, type Belonging, type Belongs, type InArea, type Project} from '../../src/core/project';
import type {AreaEdit, ProjectEdit} from '../../src/core/projects';
import {dayOf} from '../../src/core/task';
import type {Deadline as DeadlineDay, Ended} from '../../src/core/thread';
import {deadlineName} from '../../src/core/words';
import {dayName, daysLeft, today} from './days';
import {Deadline, DeadlinePicker} from './Deadline';
import {ease} from './motion';
import {Field} from './Threads';
import {placeIcons} from './When';

export type Page = {kind: 'project' | 'area'; id: string};

const colourOf = (kind: Page['kind']) => (kind === 'area' ? 'var(--icon-mid)' : 'var(--icon-bright)');

// How far along a project is: the share of its Tasks that are Done,
// whether the project itself has ended, and whether it is in Someday. The
// app gives it for every project.
export type Progress = {share: number; ended: Ended; inSomeday: boolean};
export const ProgressOf = createContext<(id: string) => Progress>(() => ({share: 0, ended: 'not_ended', inSomeday: false}));

// A project's circle, filled like a pie with the share of its Tasks that
// are Done, and full with a tick once the project is Done. The same circle
// shows wherever a project does, and the wedge grows smoothly as it changes.
// An open project in Someday has a dashed outline in Someday's grey, as a
// Task's box does in Someday.
export function ProjectCircle({id, className, style}: {id: string; className?: string; style?: CSSProperties}) {
	const {share, ended, inSomeday} = useContext(ProgressOf)(id);
	const someday = inSomeday && ended === 'not_ended';
	// The wedge is a thick stroke round a small circle, so a dash as long as
	// the share draws the pie, starting at the top.
	const r = 4;
	const round = 2 * Math.PI * r;
	return (
		<svg viewBox="0 0 24 24" data-share={share} className={cn('size-4 shrink-0', className)} style={{color: someday ? 'var(--icon-faint)' : colourOf('project'), ...style}} aria-hidden>
			<circle cx="12" cy="12" r="10" fill={ended === 'done' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeDasharray={someday ? '4 3' : undefined} strokeLinecap="round" />
			{ended === 'done' ? (
				<path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="var(--background)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
			) : (
				<circle
					cx="12"
					cy="12"
					r={r}
					fill="none"
					stroke="currentColor"
					strokeWidth={2 * r}
					strokeDasharray={`${share * round} ${round}`}
					transform="rotate(-90 12 12)"
					style={{transition: `stroke-dasharray 400ms ${ease}`}}
				/>
			)}
		</svg>
	);
}

// The symbol of a project or an area.
export function PageIcon({page, className}: {page: Page; className?: string}) {
	return page.kind === 'project' ? <ProjectCircle id={page.id} className={className} /> : <BoxIcon className={cn('shrink-0', className)} style={{color: colourOf('area')}} />;
}

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
				<PageIcon page={page} />
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
// area before the project. It opens that page. Under a day in Upcoming, as a
// project coming back that day, it is set like a Thread's heading there.
export function BelongingHeading({belonging, row, style, underDay = false, onOpen}: {belonging: Belonging; row: string; style: CSSProperties; underDay?: boolean; onOpen: (page: Page) => void}) {
	const {belongs, path, ended} = belonging;
	if (belongs.kind === 'none') return null;
	return (
		<h2 data-row={row} style={style} className={cn('mb-1 font-semibold first:mt-0', underDay ? 'mt-6 text-sm [h2+&]:mt-3' : 'mt-10 border-b pb-1.5 text-base')}>
			<button className="flex items-center gap-2 hover:text-(--icon-bright)" onClick={() => onOpen(belongs)}>
				<PageIcon page={belongs} />
				{path.length > 1 && <span className="font-normal text-muted-foreground">{path[0]} ›</span>}
				<span className={cn(ended !== 'not_ended' && 'text-muted-foreground line-through')}>{path.at(-1)}</span>
				{ended !== 'not_ended' && <span className="text-xs font-normal text-muted-foreground">{ended}</span>}
			</button>
		</h2>
	);
}

// The top of a project's or an area's page, laid out as an open Task is: its
// title and Notes to edit in place, a project's When and Deadline as buttons
// on the left, its area and Drop in the menu on the right, and the projects
// in an area. A project's circle marks it Done.
export function PageTop({page, areas, projects, onOpen, onEditProject, onEditArea, onEnd}: {
	page: Page;
	areas: Area[];
	projects: Project[];
	onOpen: (page: Page) => void;
	onEditProject: (id: string, edit: ProjectEdit) => void;
	onEditArea: (id: string, edit: AreaEdit) => void;
	onEnd: (how: 'done' | 'dropped' | 'not_ended') => void;
}) {
	const [open, setOpen] = useState<'area' | 'deadline' | 'when' | null>(null);
	const project = page.kind === 'project' ? projects.find(p => p.id === page.id) : undefined;
	const area = page.kind === 'area' ? areas.find(a => a.id === page.id) : undefined;
	const shown = project ?? area;
	if (!shown) return <p className="mb-8 text-sm text-muted-foreground">Nothing here.</p>;
	const ended = shown.ended !== 'not_ended';
	const edit = (change: ProjectEdit & AreaEdit) => (project ? onEditProject(project.id, change) : onEditArea(shown.id, {title: change.title, notes: change.notes}));
	const inArea = project?.area.kind === 'in' ? areas.find(a => a.id === (project.area as {id: string}).id) : undefined;
	const inside = area ? projects.filter(p => p.area.kind === 'in' && p.area.id === area.id) : [];
	const pick = (run: () => void) => {
		setOpen(null);
		run();
	};
	// A project's When in a Task's words: in use is Anytime, parked is
	// Someday, and a day it comes back is that day.
	const when = project?.when ?? {kind: 'active' as const};
	const [WhenIcon, whenColour] = placeIcons[when.kind === 'someday' ? 'someday' : when.kind === 'on_day' ? 'upcoming' : 'anytime'];
	const whenText = when.kind === 'someday' ? 'Someday' : when.kind === 'on_day' ? dayName(when.day) : 'Anytime';
	return (
		<div className="mb-8 flex flex-col gap-3">
			{inArea && (
				<button className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground" onClick={() => onOpen({kind: 'area', id: inArea.id})}>
					<BoxIcon className="size-3.5" />
					{inArea.title}
				</button>
			)}
			<div className="flex items-center gap-3">
				{project ? (
					// Clicking the circle marks the project Done, or opens it again, as
					// a Task's box does.
					<button type="button" aria-label={shown.ended === 'done' ? 'Open again' : 'Mark Done'} className="shrink-0 rounded-full" onClick={() => onEnd(shown.ended === 'done' ? 'not_ended' : 'done')}>
						<ProjectCircle id={project.id} className="size-6" />
					</button>
				) : (
					<PageIcon page={page} className="size-6" />
				)}
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
				{ended && (
					<Button variant="ghost" size="sm" onClick={() => onEnd('not_ended')}>
						<RotateCcwIcon data-icon="inline-start" />
						{shown.ended === 'done' ? 'Done' : 'Dropped'} · reopen
					</Button>
				)}
				{project && !ended && (
					<>
						<Popover open={open === 'when'} onOpenChange={isOpen => setOpen(isOpen ? 'when' : null)}>
							<PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="When" />}>
								<WhenIcon data-icon="inline-start" style={{color: whenColour}} />
								{whenText}
							</PopoverTrigger>
							<PopoverContent className="w-auto p-1" align="start">
								<div className="flex flex-col gap-1">
									<p className="px-2 pt-1 text-xs font-medium text-muted-foreground">When</p>
									<Calendar
										mode="single"
										weekStartsOn={1}
										selected={when.kind === 'on_day' ? new Date(`${when.day}T12:00`) : undefined}
										onSelect={d => d && pick(() => onEditProject(project.id, {when: {kind: 'on_day', day: dayOf(d)}}))}
										disabled={{before: new Date(`${today()}T00:00`)}}
									/>
									{(['anytime', 'someday'] as const).map(place => {
										const [PlaceIcon, colour] = placeIcons[place];
										return (
											<Button key={place} variant="ghost" className="justify-start" onClick={() => pick(() => onEditProject(project.id, {when: place === 'anytime' ? {kind: 'active'} : {kind: 'someday'}}))}>
												<PlaceIcon data-icon="inline-start" style={{color: colour}} />
												{place === 'anytime' ? 'Anytime' : 'Someday'}
											</Button>
										);
									})}
								</div>
							</PopoverContent>
						</Popover>
						<Popover open={open === 'deadline'} onOpenChange={isOpen => setOpen(isOpen ? 'deadline' : null)}>
							<PopoverTrigger render={<Button variant="ghost" size={project.deadline.kind === 'by_day' ? 'sm' : 'icon-sm'} aria-label="Deadline" />}>
								{project.deadline.kind === 'by_day' ? <Deadline day={project.deadline.day} /> : <FlagIcon />}
							</PopoverTrigger>
							<PopoverContent className="w-auto p-1" align="start">
								<DeadlinePicker deadline={project.deadline} onChange={deadline => pick(() => onEditProject(project.id, {deadline}))} />
							</PopoverContent>
						</Popover>
					</>
				)}
				{!ended && (
					<span className="relative ml-auto">
						{project && (
							<Popover open={open === 'area'} onOpenChange={isOpen => setOpen(isOpen ? 'area' : null)}>
								<PopoverTrigger render={<span className="absolute right-0 bottom-0 size-0" />} />
								<PopoverContent className="w-56 p-1" align="end">
									{[null, ...areas.filter(a => a.ended === 'not_ended' || a.id === inArea?.id)].map(choice => (
										<Button
											key={choice?.id ?? 'none'}
											variant="ghost"
											className="w-full justify-start"
											onClick={() => pick(() => onEditProject(project.id, {area: choice ? {kind: 'in', id: choice.id} : {kind: 'none'}}))}
										>
											{choice ? choice.title : 'No area'}
											{(choice?.id ?? null) === (inArea?.id ?? null) && <CheckIcon className="ml-auto" />}
										</Button>
									))}
								</PopoverContent>
							</Popover>
						)}
						<DropdownMenu>
							<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More" />}>
								<MoreHorizontalIcon />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-auto">
								<DropdownMenuGroup>
									{project && (
										<DropdownMenuItem onClick={() => setOpen('area')}>
											<BoxIcon />
											{inArea ? 'Move to another area' : 'Put in an area'}
										</DropdownMenuItem>
									)}
									<DropdownMenuItem onClick={() => onEnd('dropped')}>
										<XIcon />
										Drop
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</span>
				)}
			</div>
			{inside.length > 0 && (
				<div className="mt-3 flex flex-col">
					<h2 className="mb-1 border-b pb-1 text-sm font-semibold">Projects</h2>
					{inside.map(p => (
						<button key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => onOpen({kind: 'project', id: p.id})}>
							<ProjectCircle id={p.id} className="size-3.5" />
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
					return (
						<button
							key={one.belongs.kind === 'none' ? 'none' : one.belongs.id}
							className={cn('flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm', i === at && 'bg-accent')}
							onMouseEnter={() => setAt(i)}
							onClick={() => onPick(one.belongs)}
						>
							{one.belongs.kind !== 'none' ? (
								<>
									<PageIcon page={one.belongs} className="size-3.5" />
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
