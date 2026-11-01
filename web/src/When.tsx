import {ArchiveIcon, CalendarIcon, InboxIcon, LayersIcon, StarIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Calendar} from '@/components/ui/calendar';
import {dayOf, listNames, listOf, type Place, type Task} from '../../src/core/task';
import type {TaskEdit} from '../../src/core/tasks';
import {dayName, today} from './days';

// The list icons, coloured as the sidebar colours them.
export const placeIcons = {
	inbox: [InboxIcon, 'var(--icon-bright)'],
	today: [StarIcon, 'var(--icon-bright)'],
	upcoming: [CalendarIcon, 'var(--icon-mid)'],
	anytime: [LayersIcon, 'var(--icon-mid)'],
	someday: [ArchiveIcon, 'var(--icon-faint)'],
} as const;

// What the When button on an open Task says.
export function whenLabel(task: Task) {
	if (task.when.kind === 'on_day') return dayName(task.when.day);
	return task.when.kind === 'inbox' ? 'When' : listNames[listOf(task, today())];
}

// The When picker, as in Things: Today, a day on the calendar, Anytime or
// Someday, and the Inbox when asked.
export function WhenPicker({task, inbox = false, onEdit}: {task: Task | null; inbox?: boolean; onEdit: (edit: TaskEdit) => void}) {
	const place = (p: Place) => {
		const [Icon, colour] = placeIcons[p];
		return (
			<Button variant="ghost" className="justify-start" onClick={() => onEdit({when: {kind: p}})}>
				<Icon data-icon="inline-start" style={{color: colour}} />
				{listNames[p]}
			</Button>
		);
	};
	return (
		<div className="flex flex-col gap-1">
			<p className="px-2 pt-1 text-xs font-medium text-muted-foreground">When</p>
			{place('today')}
			<Calendar
				mode="single"
				selected={task?.when.kind === 'on_day' ? new Date(`${task.when.day}T12:00`) : undefined}
				onSelect={d => d && onEdit({when: {kind: 'on_day', day: dayOf(d)}})}
				disabled={{before: new Date(`${today()}T00:00`)}}
				weekStartsOn={1}
			/>
			{place('anytime')}
			{place('someday')}
			{inbox && place('inbox')}
		</div>
	);
}
