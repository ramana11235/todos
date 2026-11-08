import {useLayoutEffect, useRef, useState} from 'react';
import {BellIcon, XIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Calendar} from '@/components/ui/calendar';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import type {Reminder} from '../../src/core/reminder';
import {dayOf} from '../../src/core/task';
import {reminderName} from '../../src/core/words';
import {dayName, today} from './days';
import {ease, ms} from './motion';
import {askForPush} from './push';
import {begin} from './settled';

// A Reminder's moment as I read it on this device, such as "Tomorrow 18:30".
export const reminderText = (at: string) => reminderName(at, today());

const timeOf = (moment: Date) => `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`;

// Picks a day and a time, 09:00 to start with, on this device's clock, and
// gives back the moment. It can also clear a Reminder that is there.
export function ReminderPicker({reminder, onChange}: {reminder: Reminder; onChange: (reminder: Reminder) => void}) {
	const start = reminder.kind === 'none' ? null : new Date(reminder.at);
	const [day, setDay] = useState(start ? dayOf(start) : today());
	const [time, setTime] = useState(start ? timeOf(start) : '09:00');
	return (
		<div className="flex flex-col gap-1">
			<p className="px-2 pt-1 text-xs font-medium text-muted-foreground">Remind me</p>
			<Calendar
				mode="single"
				weekStartsOn={1}
				selected={new Date(`${day}T12:00`)}
				onSelect={d => d && setDay(dayOf(d))}
				disabled={{before: new Date(`${today()}T00:00`)}}
			/>
			<label className="flex items-center justify-between gap-3 px-2 py-1 text-sm">
				<span className="text-muted-foreground">At</span>
				<input type="time" aria-label="Time" value={time} onChange={e => e.currentTarget.value && setTime(e.currentTarget.value)} className="rounded-md border bg-transparent px-2 py-1 text-sm" />
			</label>
			<Button
				className="mx-1"
				onClick={() => {
					// The first Reminder set on a device is when it is asked to
					// show notifications, since a browser asks only after a tap.
					void askForPush();
					onChange({kind: 'set', at: new Date(`${day}T${time}`).toISOString()});
				}}
			>
				Remind me {['Today', 'Tomorrow'].includes(dayName(day)) ? dayName(day).toLowerCase() : dayName(day)} at {time}
			</Button>
			{reminder.kind !== 'none' && (
				<Button variant="ghost" className="justify-start" onClick={() => onChange({kind: 'none'})}>
					Clear reminder
				</Button>
			)}
		</div>
	);
}

// The Reminder's button, straight after When. It always shows words, as When
// does: "Remind me" until one is set, then its day and time.
export function RemindButton({reminder, onChange}: {reminder: Reminder; onChange: (reminder: Reminder) => void}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={<Button variant="ghost" size="sm" aria-label="Reminder" />}>
				<BellIcon data-icon="inline-start" style={{color: reminder.kind === 'none' ? 'var(--icon-faint)' : 'var(--icon-bright)'}} />
				{reminder.kind === 'none' ? 'Remind me' : reminderText(reminder.at)}
			</PopoverTrigger>
			<PopoverContent className="w-auto p-1" align="start">
				<ReminderPicker
					reminder={reminder}
					onChange={next => {
						setOpen(false);
						onChange(next);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}

// Anything with a Reminder: a Task, a Thread or a project.
export type Reminded = {kind: 'task' | 'thread' | 'project'; id: string; title: string; reminder: Reminder};

// The bell at the top right. A quiet dot fades in once a Reminder is due,
// with no number. Its list shows the due Reminders, then those still to
// come, each opening its item; a due one can be cleared, and one that leaves
// the list fades out of it first.
export function Bell({items, onOpen, onClear}: {items: Reminded[]; onOpen: (item: Reminded) => void; onClear: (item: Reminded) => void}) {
	const [open, setOpen] = useState(false);
	const byMoment = (kind: 'due' | 'set') =>
		items.filter(one => one.reminder.kind === kind).sort((a, b) => momentOf(a).localeCompare(momentOf(b)));
	const due = byMoment('due');
	const coming = byMoment('set');
	const dot = useRef<HTMLSpanElement>(null);
	const had = useRef(due.length > 0);
	useLayoutEffect(() => {
		if (due.length > 0 && !had.current) dot.current?.animate([{opacity: 0, scale: 0.4}, {opacity: 1, scale: 1}], {duration: ms * 2, easing: ease});
		had.current = due.length > 0;
	});
	// The row fades out, then the change is made, so it does not jump away.
	const leave = (row: HTMLElement | null, then: () => void) => {
		const done = begin();
		const finish = () => {
			then();
			done();
		};
		if (!row) return finish();
		void row.animate([{opacity: 1}, {opacity: 0}], {duration: ms, easing: ease, fill: 'forwards'}).finished.then(finish, finish);
	};
	const row = (task: Reminded) => (
		<button
			className="flex min-w-0 flex-1 flex-col items-start px-2 py-1.5 text-left"
			onClick={e => {
				const go = () => {
					setOpen(false);
					onOpen(task);
				};
				if (task.reminder.kind === 'due') leave(e.currentTarget.parentElement, go);
				else go();
			}}
		>
			<span className="w-full truncate text-sm">{task.title}</span>
			<span className="text-xs text-muted-foreground">{reminderText(momentOf(task))}</span>
		</button>
	);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Reminders" className="relative" />}>
				<BellIcon />
				{due.length > 0 && <span ref={dot} data-due className="absolute top-1 right-1 size-2 rounded-full" style={{background: 'var(--icon-bright)'}} />}
			</PopoverTrigger>
			<PopoverContent className="w-72 p-1" align="end">
				<p className="px-2 pt-1 pb-1 text-xs font-medium text-muted-foreground">Due</p>
				{due.length === 0 && <p className="px-2 pb-2 text-sm text-muted-foreground">Nothing is due.</p>}
				{due.map(task => (
					<div key={task.id} data-reminder={task.id} data-kind={task.kind} className="flex items-center gap-1 rounded-md hover:bg-muted/50">
						{row(task)}
						<Button variant="ghost" size="icon-sm" aria-label="Clear" onClick={e => leave(e.currentTarget.parentElement, () => onClear(task))}>
							<XIcon />
						</Button>
					</div>
				))}
				{coming.length > 0 && (
					<>
						<p className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">Coming up</p>
						{coming.map(task => (
							<div key={task.id} data-reminder={task.id} className="flex rounded-md hover:bg-muted/50">
								{row(task)}
							</div>
						))}
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}

const momentOf = (item: Reminded) => (item.reminder.kind === 'none' ? '' : item.reminder.at);
