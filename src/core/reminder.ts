// A Reminder and the port that wakes todos when one comes. Nothing here
// touches storage, the network or a timer.

import {ThreadError} from './threads.js';

// A moment at which todos tells me about an item. `at` is an instant such as
// 2026-11-09T09:00:00.000Z, so it is the same moment wherever it is read; a
// client turns the day and time I pick in my own zone into it. A Reminder
// that is set waits for its moment, and once it comes it is due until I open
// its item from the bell, clear it, or the item ends, which uses it up.
export type Reminder = {kind: 'none'} | {kind: 'set'; at: string} | {kind: 'due'; at: string};

// What a Reminder can belong to. Threads and projects get Reminders later.
export type ReminderItem = {kind: 'task'; id: string};

// Wakes todos when an item's Reminder comes. Each item has at most one, so
// `set` replaces any the item had, and `clear` removes it. When one comes,
// the adapter calls `reminderCame` with the item. The hosted Instance uses a
// Durable Object per item and a local Instance a timer per item.
export interface ReminderClock {
	set(item: ReminderItem, at: string): Promise<void>;
	clear(item: ReminderItem): Promise<void>;
}

// For code that never sets a Reminder, such as tests of other things: it
// never goes off.
export const clockThatNeverGoesOff: ReminderClock = {
	set: async () => {},
	clear: async () => {},
};

// A client sets a Reminder or clears it. Only the clock makes one due.
export function requireReminder(value: unknown): Reminder {
	const reminder = value as {kind?: unknown; at?: unknown} | null;
	if (reminder?.kind === 'none') return {kind: 'none'};
	if (reminder?.kind === 'set' && typeof reminder.at === 'string' && !Number.isNaN(Date.parse(reminder.at))) {
		return {kind: 'set', at: new Date(reminder.at).toISOString()};
	}
	throw new ThreadError('invalid', 'A Reminder is {kind: "none"} or {kind: "set", at: "2026-11-09T09:00:00.000Z"}');
}

// What a Reminder becomes once it is saved at `now`: one whose moment has
// already passed is due at once, so nothing waits on a clock for it.
export const reminderAt = (reminder: Reminder, now: Date): Reminder =>
	reminder.kind === 'set' && Date.parse(reminder.at) <= now.getTime() ? {kind: 'due', at: reminder.at} : reminder;
