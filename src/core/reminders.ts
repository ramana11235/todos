// What happens when a Reminder's moment comes, for any item, and setting
// every clock again when a local API starts.

import type {Storage} from '../storage/storage.js';
import {notifierThatSendsNothing, type Notifier} from './push.js';
import {reminderAt, type Reminder, type ReminderClock, type ReminderItem} from './reminder.js';

export class Reminders {
	constructor(
		private readonly storage: Storage,
		private readonly now: () => Date = () => new Date(),
		private readonly notifier: Notifier = notifierThatSendsNothing,
	) {}

	// Called by the clock when an item's Reminder comes. Only one still set
	// for a moment that has passed becomes due, so a clock that wakes for a
	// Reminder since changed or cleared changes nothing. It is saved as due
	// before it is sent, so a clock that tries again never sends it twice.
	async came(item: ReminderItem): Promise<void> {
		const found = await this.find(item);
		if (found?.reminder.kind !== 'set') return;
		const next = reminderAt(found.reminder, this.now());
		if (next.kind !== 'due') return;
		await this.save(item, next);
		await this.notifier.notify({item, title: found.title});
	}

	// Sets the clock for every Reminder still waiting, as a local Instance
	// does when it starts, since its timers did not outlive the last run. One
	// whose moment passed meanwhile comes at once.
	async wakeAll(clock: ReminderClock): Promise<void> {
		const [tasks, threads, projects] = await Promise.all([this.storage.listTasks(), this.storage.listThreads(), this.storage.listProjects()]);
		const items = [
			...tasks.map(one => ({item: {kind: 'task' as const, id: one.id}, reminder: one.reminder})),
			...threads.map(one => ({item: {kind: 'thread' as const, id: one.id}, reminder: one.reminder})),
			...projects.map(one => ({item: {kind: 'project' as const, id: one.id}, reminder: one.reminder})),
		];
		for (const {item, reminder} of items) {
			if (reminder.kind !== 'set') continue;
			if (reminderAt(reminder, this.now()).kind === 'due') await this.came(item);
			else await clock.set(item, reminder.at);
		}
	}

	private async find(item: ReminderItem): Promise<{reminder: Reminder; title: string} | undefined> {
		if (item.kind === 'task') return this.storage.getTask(item.id);
		if (item.kind === 'thread') return this.storage.getThread(item.id);
		return (await this.storage.listProjects()).find(project => project.id === item.id);
	}

	private save(item: ReminderItem, reminder: Reminder): Promise<void> {
		if (item.kind === 'task') return this.storage.updateTask(item.id, {reminder});
		if (item.kind === 'thread') return this.storage.updateThread(item.id, {reminder});
		return this.storage.updateProject(item.id, {reminder});
	}
}
