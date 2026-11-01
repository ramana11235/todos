import {FlagIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Calendar} from '@/components/ui/calendar';
import {cn} from '@/lib/utils';
import {dayOf} from '../../src/core/task';
import type {Deadline as TaskDeadline} from '../../src/core/thread';
import {deadlineName} from '../../src/core/words';
import {daysLeft, today} from './days';

// How a Deadline reads on a Task: coloured only when a day or less is left.
export function Deadline({day}: {day: string}) {
	const left = daysLeft(day);
	return (
		<span className={cn('flex items-center gap-1 text-xs', left > 1 && 'text-muted-foreground')} style={left <= 1 ? {color: 'var(--deadline)'} : undefined}>
			<FlagIcon className="size-3" />
			{deadlineName(day, today())}
		</span>
	);
}

export function DeadlinePicker({deadline, onChange}: {deadline: TaskDeadline; onChange: (deadline: TaskDeadline) => void}) {
	return (
		<div className="flex flex-col gap-1">
			<p className="px-2 pt-1 text-xs font-medium text-muted-foreground">Deadline</p>
			<Calendar
				mode="single"
				selected={deadline.kind === 'by_day' ? new Date(`${deadline.day}T12:00`) : undefined}
				onSelect={d => d && onChange({kind: 'by_day', day: dayOf(d)})}
				weekStartsOn={1}
			/>
			{deadline.kind === 'by_day' && (
				<Button variant="ghost" className="justify-start" onClick={() => onChange({kind: 'none'})}>
					Clear deadline
				</Button>
			)}
		</div>
	);
}
