// A local Instance's ReminderClock: one timer per item in the API process.
// Timers end with the process, so the API sets them all again when it starts
// (Tasks.wakeAll).

import type {ReminderClock, ReminderItem} from '../core/reminder.js';

// The longest wait a Node timer takes, about 24.8 days. A Reminder further
// off waits that long and then sets its timer again.
const longest = 2 ** 31 - 1;

export class TimerClock implements ReminderClock {
	private readonly timers = new Map<string, NodeJS.Timeout>();

	constructor(
		private readonly came: (item: ReminderItem) => Promise<void>,
		private readonly now: () => number = Date.now,
	) {}

	async set(item: ReminderItem, at: string): Promise<void> {
		await this.clear(item);
		const wait = Math.max(0, Date.parse(at) - this.now());
		const timer = setTimeout(() => {
			this.timers.delete(keyOf(item));
			if (wait > longest) void this.set(item, at);
			else this.came(item).catch(error => console.error(`The Reminder for ${keyOf(item)} could not be made due:`, error));
		}, Math.min(wait, longest));
		// A waiting Reminder does not keep the process running.
		timer.unref();
		this.timers.set(keyOf(item), timer);
	}

	async clear(item: ReminderItem): Promise<void> {
		clearTimeout(this.timers.get(keyOf(item)));
		this.timers.delete(keyOf(item));
	}
}

const keyOf = (item: ReminderItem) => `${item.kind}:${item.id}`;
