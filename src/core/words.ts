// The words for a Thread's state and for days, written once so Home, the
// terminal task panel and the web app read the same. `today` is a day such
// as 2026-10-30, in my own time zone.

import type {ShownMove, When} from './thread.js';

export const moveName: Record<ShownMove, string> = {working: 'working', on_me: 'on me', waiting: 'waiting'};

export const whenName = (when: When, today: string): string =>
	when.kind === 'on_day' && when.day > today ? `Back on ${dayName(when.day, today)}` : when.kind === 'someday' ? 'Someday' : 'Active';

// Days from today to `day`, negative once it has passed.
export const daysLeft = (day: string, today: string): number => Math.round((Date.parse(day) - Date.parse(today)) / 864e5);

// "Today", "Tomorrow", "Fri 24", or "3 Nov" when more than a week away.
export function dayName(day: string, today: string): string {
	const left = daysLeft(day, today);
	if (left === 0) return 'Today';
	if (left === 1) return 'Tomorrow';
	if (left === -1) return 'Yesterday';
	const d = new Date(`${day}T12:00`);
	return Math.abs(left) > 6
		? d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})
		: d.toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric'});
}

// How a Deadline reads: how many days are left while it is near.
export const deadlineName = (day: string, today: string): string => {
	const left = daysLeft(day, today);
	return left < 0 ? `${-left}d overdue` : left === 0 ? 'Due today' : left <= 6 ? `${left}d left` : dayName(day, today);
};

// How a Reminder's moment reads on this device's clock: its day in words,
// then the time, such as "Tomorrow 18:30".
export function reminderName(at: string, today: string): string {
	const moment = new Date(at);
	const day = `${moment.getFullYear()}-${String(moment.getMonth() + 1).padStart(2, '0')}-${String(moment.getDate()).padStart(2, '0')}`;
	return `${dayName(day, today)} ${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`;
}
