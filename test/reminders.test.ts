import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {ReminderClock, ReminderItem} from '../src/core/reminder.js';
import {Projects} from '../src/core/projects.js';
import {Reminders} from '../src/core/reminders.js';
import {Tasks} from '../src/core/tasks.js';
import {Threads} from '../src/core/threads.js';
import {DurableObjectClock, ReminderAlarm} from '../src/reminders/alarm.js';
import {TimerClock} from '../src/reminders/timers.js';
import type {D1Database} from '../src/storage/d1.js';
import type {Storage} from '../src/storage/storage.js';
import {makeStorage, testD1} from './support.js';

// A clock the test moves forward by hand. It keeps the one moment each item
// is set for, as both real clocks do, and `moveTo` makes due every Reminder
// whose moment has come.
class TestClock implements ReminderClock {
	readonly set_ = new Map<string, string>();
	time = new Date('2026-11-08T08:00:00Z');
	came: (item: ReminderItem) => Promise<void> = async () => {};

	readonly items = new Map<string, ReminderItem>();

	async set(item: ReminderItem, at: string) {
		this.set_.set(item.id, at);
		this.items.set(item.id, item);
	}

	async clear(item: ReminderItem) {
		this.set_.delete(item.id);
	}

	async moveTo(time: string) {
		this.time = new Date(time);
		for (const [id, at] of [...this.set_]) {
			if (Date.parse(at) > this.time.getTime()) continue;
			this.set_.delete(id);
			await this.came(this.items.get(id)!);
		}
	}
}

let storage: Storage;
let clock: TestClock;
let tasks: Tasks;

beforeEach(async () => {
	storage = await makeStorage();
	clock = new TestClock();
	tasks = new Tasks(storage, () => clock.time, clock);
	clock.came = item => new Reminders(storage, () => clock.time).came(item);
});

const nine = '2026-11-09T09:00:00.000Z';

describe("a Task's Reminder", () => {
	it('is set for a moment without changing the Task\'s list or When', async () => {
		const task = await tasks.add({title: 'Call the dentist', when: {kind: 'anytime'}});
		const edited = await tasks.edit(task.id, {reminder: {kind: 'set', at: nine}});
		expect(edited.reminder).toEqual({kind: 'set', at: nine});
		expect(edited.when).toEqual({kind: 'anytime'});
		expect(clock.set_.get(task.id)).toBe(nine);
		expect((await tasks.get(task.id)).reminder).toEqual({kind: 'set', at: nine});
	});

	it('becomes due when its moment comes, and not before', async () => {
		const task = await tasks.add({title: 'Call the dentist', reminder: {kind: 'set', at: nine}});
		await clock.moveTo('2026-11-09T08:59:00Z');
		expect((await tasks.get(task.id)).reminder.kind).toBe('set');
		await clock.moveTo('2026-11-09T09:00:00Z');
		expect((await tasks.get(task.id)).reminder).toEqual({kind: 'due', at: nine});
	});

	it('set again for a new moment replaces the old one', async () => {
		const task = await tasks.add({title: 'Call the dentist', reminder: {kind: 'set', at: nine}});
		await tasks.edit(task.id, {reminder: {kind: 'set', at: '2026-11-10T09:00:00.000Z'}});
		await clock.moveTo('2026-11-09T09:30:00Z');
		expect((await tasks.get(task.id)).reminder.kind).toBe('set');
	});

	it('cleared takes its moment off the clock', async () => {
		const task = await tasks.add({title: 'Call the dentist', reminder: {kind: 'set', at: nine}});
		await tasks.edit(task.id, {reminder: {kind: 'none'}});
		expect(clock.set_.has(task.id)).toBe(false);
		expect((await tasks.get(task.id)).reminder).toEqual({kind: 'none'});
	});

	it('coming after it was cleared changes nothing', async () => {
		const task = await tasks.add({title: 'Call the dentist', reminder: {kind: 'set', at: nine}});
		await tasks.edit(task.id, {reminder: {kind: 'none'}});
		clock.time = new Date('2026-11-09T10:00:00Z');
		await new Reminders(storage, () => clock.time).came({kind: 'task', id: task.id});
		expect((await tasks.get(task.id)).reminder).toEqual({kind: 'none'});
	});

	it('set for a moment already past is due at once', async () => {
		const task = await tasks.add({title: 'Call the dentist', reminder: {kind: 'set', at: '2026-11-08T07:00:00.000Z'}});
		expect(task.reminder).toEqual({kind: 'due', at: '2026-11-08T07:00:00.000Z'});
		expect(clock.set_.has(task.id)).toBe(false);
	});

	it('is used up when its Task is done or dropped', async () => {
		for (const ended of ['done', 'dropped'] as const) {
			const task = await tasks.add({title: 'Call the dentist', reminder: {kind: 'set', at: nine}});
			expect((await tasks.edit(task.id, {ended})).reminder).toEqual({kind: 'none'});
			expect(clock.set_.has(task.id)).toBe(false);
		}
	});

	it('is gone with its Task when the Task is turned into a Thread', async () => {
		const task = await tasks.add({title: 'Call the dentist', reminder: {kind: 'set', at: nine}});
		await tasks.turnIntoThread(task.id, null, new Threads(storage));
		expect(clock.set_.has(task.id)).toBe(false);
	});

	it('is refused unless it is none or set for a moment', async () => {
		const task = await tasks.add({title: 'Call the dentist'});
		for (const reminder of [{kind: 'set', at: 'tomorrow'}, {kind: 'due', at: nine}, {kind: 'set'}, null]) {
			await expect(tasks.edit(task.id, {reminder} as never)).rejects.toThrow('A Reminder is');
		}
	});

	it('waiting when the API starts is set on the clock again, and one whose moment passed meanwhile is due', async () => {
		const waiting = await tasks.add({title: 'Call the dentist', reminder: {kind: 'set', at: nine}});
		const missed = await tasks.add({title: 'Pay the bill', reminder: {kind: 'set', at: '2026-11-08T09:00:00.000Z'}});
		const restarted = new TestClock();
		restarted.time = new Date('2026-11-08T12:00:00Z');
		await new Reminders(storage, () => restarted.time).wakeAll(restarted);
		expect(restarted.set_.get(waiting.id)).toBe(nine);
		expect((await tasks.get(missed.id)).reminder.kind).toBe('due');
	});
});

describe("a Thread's and a project's Reminder", () => {
	it('is set, comes due and is used up when the Thread ends, without changing its When', async () => {
		const threads = new Threads(storage, () => clock.time, clock);
		const thread = await threads.create({title: 'Plan the garden', when: {kind: 'someday'}});
		const edited = await threads.edit(thread.id, {reminder: {kind: 'set', at: nine}});
		expect(edited.when).toEqual({kind: 'someday'});
		await clock.moveTo('2026-11-09T09:00:00Z');
		expect((await threads.get(thread.id)).reminder).toEqual({kind: 'due', at: nine});
		expect((await threads.edit(thread.id, {ended: 'done'})).reminder).toEqual({kind: 'none'});
	});

	it('is set by a Session on its own Thread and cleared again', async () => {
		const threads = new Threads(storage, () => clock.time, clock);
		const thread = await threads.create({title: 'Plan the garden'});
		await threads.sessionUpdate(thread.id, {reminder: {kind: 'set', at: nine}});
		expect(clock.set_.get(thread.id)).toBe(nine);
		await threads.sessionUpdate(thread.id, {reminder: {kind: 'none'}});
		expect(clock.set_.has(thread.id)).toBe(false);
	});

	it('is set on a project, comes due and is used up when the project is dropped', async () => {
		const projects = new Projects(storage, () => clock.time, clock);
		const project = await projects.createProject({title: 'Move flat'});
		await projects.editProject(project.id, {reminder: {kind: 'set', at: nine}});
		await clock.moveTo('2026-11-09T09:00:00Z');
		expect((await projects.listProjects())[0]!.reminder).toEqual({kind: 'due', at: nine});
		expect((await projects.editProject(project.id, {ended: 'dropped'})).reminder).toEqual({kind: 'none'});
	});

	it('waiting when the API starts is set on the clock again, for every kind of item', async () => {
		const thread = await new Threads(storage, () => clock.time, clock).create({title: 'Plan the garden'});
		await new Threads(storage, () => clock.time, clock).edit(thread.id, {reminder: {kind: 'set', at: nine}});
		const project = await new Projects(storage, () => clock.time, clock).createProject({title: 'Move flat'});
		await new Projects(storage, () => clock.time, clock).editProject(project.id, {reminder: {kind: 'set', at: nine}});
		const restarted = new TestClock();
		await new Reminders(storage, () => restarted.time).wakeAll(restarted);
		expect(restarted.items.get(thread.id)).toEqual({kind: 'thread', id: thread.id});
		expect(restarted.items.get(project.id)).toEqual({kind: 'project', id: project.id});
	});
});

describe("a local Instance's timers", () => {
	beforeEach(() => vi.useFakeTimers({now: new Date('2026-11-08T08:00:00Z')}));
	afterEach(() => vi.useRealTimers());

	const item = {kind: 'task' as const, id: 't1'};

	it('make a Reminder due at its moment', async () => {
		const came = vi.fn(async () => {});
		await new TimerClock(came).set(item, '2026-11-08T09:00:00Z');
		await vi.advanceTimersByTimeAsync(60 * 60 * 1000 - 1);
		expect(came).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(came).toHaveBeenCalledWith(item);
	});

	it('keep only the latest moment for an item, and none once cleared', async () => {
		const came = vi.fn(async () => {});
		const timers = new TimerClock(came);
		await timers.set(item, '2026-11-08T09:00:00Z');
		await timers.set(item, '2026-11-08T10:00:00Z');
		await vi.advanceTimersByTimeAsync(90 * 60 * 1000);
		expect(came).not.toHaveBeenCalled();
		await timers.clear(item);
		await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000);
		expect(came).not.toHaveBeenCalled();
	});

	it('wait past the longest a timer can, for a Reminder months away', async () => {
		const came = vi.fn(async () => {});
		await new TimerClock(came).set(item, '2027-03-08T08:00:00Z');
		await vi.advanceTimersByTimeAsync(Date.parse('2027-03-08T08:00:00Z') - Date.now() - 1);
		expect(came).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(came).toHaveBeenCalledOnce();
	});
});

describe("the hosted Instance's alarms", () => {
	// Durable Objects as Cloudflare keeps them, one per name, each with its
	// own stored values and at most one alarm.
	const alarms = (db: D1Database) => {
		const objects = new Map<string, {alarm: ReminderAlarm; values: Map<string, unknown>; at: number | null}>();
		const objectFor = (name: string) => {
			if (!objects.has(name)) {
				const values = new Map<string, unknown>();
				const object: {alarm: ReminderAlarm; values: Map<string, unknown>; at: number | null} = {values, at: null, alarm: undefined as never};
				object.alarm = new ReminderAlarm({
					storage: {
						get: async key => values.get(key) as never,
						put: async (key, value) => void values.set(key, value),
						deleteAll: async () => values.clear(),
						setAlarm: async at => void (object.at = at),
						deleteAlarm: async () => void (object.at = null),
					},
				}, {DB: db});
				objects.set(name, object);
			}
			return objects.get(name)!;
		};
		return {objects, namespace: {idFromName: (name: string) => name, get: (name: unknown) => ({fetch: (request: Request) => objectFor(name as string).alarm.fetch(request)})}};
	};

	// The alarm reads D1 itself, so these run only on the D1 test storage.
	const onD1 = process.env.TODOS_TEST_STORAGE === 'd1' ? it : it.skip;

	it('set one alarm per item for its moment, and clear it', async () => {
		const {objects, namespace} = alarms({} as D1Database);
		const clock = new DurableObjectClock(namespace);
		await clock.set({kind: 'task', id: 't1'}, nine);
		await clock.set({kind: 'task', id: 't1'}, '2026-11-10T09:00:00.000Z');
		await clock.set({kind: 'task', id: 't2'}, nine);
		expect(objects.get('task:t1')!.at).toBe(Date.parse('2026-11-10T09:00:00.000Z'));
		expect(objects.get('task:t2')!.at).toBe(Date.parse(nine));
		await clock.clear({kind: 'task', id: 't1'});
		expect(objects.get('task:t1')!.at).toBeNull();
		expect(objects.get('task:t2')!.at).toBe(Date.parse(nine));
	});

	onD1('make the Task\'s Reminder due when the alarm goes off', async () => {
		const {objects, namespace} = alarms(testD1());
		// Set in 2020 for a moment then still ahead, so it has come by the time
		// the alarm reads the real clock.
		const hosted = new Tasks(storage, () => new Date('2020-01-01T08:00:00Z'), new DurableObjectClock(namespace));
		const task = await hosted.add({title: 'Call the dentist', reminder: {kind: 'set', at: '2020-01-01T09:00:00.000Z'}});
		await objects.get(`task:${task.id}`)!.alarm.alarm();
		expect((await hosted.get(task.id)).reminder.kind).toBe('due');
	});
});
