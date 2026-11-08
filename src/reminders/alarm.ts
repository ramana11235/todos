// The hosted Instance's ReminderClock: each item with a Reminder has its own
// Durable Object, named by the item, whose alarm goes off at the Reminder's
// moment. Setting an alarm replaces the one it had, so the item's Reminder
// schedules exactly itself and no other is touched.

import type {ReminderClock, ReminderItem} from '../core/reminder.js';
import {Tasks} from '../core/tasks.js';
import {D1Storage, type D1Database} from '../storage/d1.js';

// The parts of Cloudflare's Durable Object bindings used here, so nothing
// imports Cloudflare's own module and the Worker still loads in Node's tests.
export type DurableObjectNamespace = {
	idFromName(name: string): unknown;
	get(id: unknown): {fetch(request: Request): Promise<Response>};
};
type DurableObjectState = {
	storage: {
		get<T>(key: string): Promise<T | undefined>;
		put(key: string, value: unknown): Promise<void>;
		deleteAll(): Promise<void>;
		setAlarm(at: number): Promise<void>;
		deleteAlarm(): Promise<void>;
	};
};

export class DurableObjectClock implements ReminderClock {
	constructor(private readonly reminders: DurableObjectNamespace) {}

	set(item: ReminderItem, at: string): Promise<void> {
		return this.send(item, 'PUT', {item, at});
	}

	clear(item: ReminderItem): Promise<void> {
		return this.send(item, 'DELETE');
	}

	private async send(item: ReminderItem, method: string, body?: unknown): Promise<void> {
		const alarm = this.reminders.get(this.reminders.idFromName(`${item.kind}:${item.id}`));
		const response = await alarm.fetch(new Request('https://reminder/', {method, body: body === undefined ? null : JSON.stringify(body)}));
		if (!response.ok) throw new Error(`The Reminder's alarm answered ${response.status}`);
	}
}

// One item's alarm. It keeps the item, so it knows whose Reminder came.
export class ReminderAlarm {
	constructor(
		private readonly state: DurableObjectState,
		private readonly env: {DB: D1Database},
	) {}

	async fetch(request: Request): Promise<Response> {
		const {storage} = this.state;
		if (request.method === 'PUT') {
			const {item, at} = (await request.json()) as {item: ReminderItem; at: string};
			await storage.put('item', item);
			await storage.setAlarm(Date.parse(at));
		} else {
			await storage.deleteAlarm();
			await storage.deleteAll();
		}
		return new Response(null, {status: 204});
	}

	// An error here makes Cloudflare try again, a few times, with a growing wait.
	async alarm(): Promise<void> {
		const item = await this.state.storage.get<ReminderItem>('item');
		if (item) await new Tasks(new D1Storage(this.env.DB)).reminderCame(item.id);
		await this.state.storage.deleteAll();
	}
}
