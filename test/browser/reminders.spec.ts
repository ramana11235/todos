import type {Page} from '@playwright/test';
import {expect, open, settled, test} from './todos.js';

const bell = (page: Page) => page.getByRole('button', {name: 'Reminders'});
const list = (page: Page) => page.locator('[data-slot="popover-content"]');
const dueDot = (page: Page) => page.locator('[data-due]').filter({visible: true});
const card = (page: Page, id: string) => page.locator(`main [data-task="${id}"]`);

test.describe("a Task's Reminder", () => {
	test('set from an open Task, it shows on the button and as a bell on the row, without moving the Task', async ({page, todos}) => {
		const task = await todos.client.addTask({title: 'Call the dentist', when: {kind: 'anytime'}});
		await open(page, todos, 'anytime');
		await card(page, task.id).dblclick();
		await card(page, task.id).getByRole('button', {name: 'Reminder', exact: true}).click();
		await list(page).getByRole('button', {name: /^Remind me today at 09:00$/}).click();
		await settled(page);
		const saved = await todos.client.task(task.id);
		const today = new Date();
		const nine = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9).toISOString();
		expect(saved.reminder.kind === 'none' ? null : saved.reminder.at).toBe(nine);
		expect(saved.when).toEqual({kind: 'anytime'});
		expect(await card(page, task.id).getByRole('button', {name: 'Reminder', exact: true}).textContent()).toContain('Today 09:00');
		await page.keyboard.press('Escape');
		await settled(page);
		expect(await card(page, task.id).getByLabel('Has a reminder').count()).toBe(1);
	});

	test('due, it puts a dot on the bell, and opening it from the list opens its Task and uses it up', async ({page, todos}) => {
		const task = await todos.client.addTask({title: 'Call the dentist', when: {kind: 'anytime'}, reminder: {kind: 'set', at: '2020-01-01T09:00:00.000Z'}});
		await open(page, todos, 'inbox');
		expect(await dueDot(page).count()).toBe(1);
		await bell(page).filter({visible: true}).click();
		await list(page).locator(`[data-reminder="${task.id}"]`).getByText('Call the dentist').click();
		await settled(page);
		expect((await todos.client.task(task.id)).reminder).toEqual({kind: 'none'});
		expect(await page.locator(`main [data-task="${task.id}"] textarea`).count()).toBe(1);
		expect(await dueDot(page).count()).toBe(0);
	});

	test('due, it can be cleared from the list', async ({page, todos}) => {
		const task = await todos.client.addTask({title: 'Call the dentist', reminder: {kind: 'set', at: '2020-01-01T09:00:00.000Z'}});
		await open(page, todos, 'inbox');
		await bell(page).filter({visible: true}).click();
		await list(page).locator(`[data-reminder="${task.id}"]`).getByRole('button', {name: 'Clear'}).click();
		await settled(page);
		expect((await todos.client.task(task.id)).reminder).toEqual({kind: 'none'});
		expect(await dueDot(page).count()).toBe(0);
	});

	test('still ahead, it is listed under Coming up with no dot on the bell', async ({page, todos}) => {
		const task = await todos.client.addTask({title: 'Renew the passport', reminder: {kind: 'set', at: '2099-01-01T09:00:00.000Z'}});
		await open(page, todos, 'inbox');
		expect(await dueDot(page).count()).toBe(0);
		await bell(page).filter({visible: true}).click();
		expect(await list(page).getByText('Coming up').count()).toBe(1);
		expect(await list(page).locator(`[data-reminder="${task.id}"]`).count()).toBe(1);
	});
});

test.describe("a Thread's and a project's Reminder", () => {
	test("set from a project's page, it shows its day and time there", async ({page, todos}) => {
		const project = await todos.client.createProject({title: 'Move flat'});
		await open(page, todos, `project/${project.id}`);
		await page.locator('main').getByRole('button', {name: 'Reminder', exact: true}).click();
		await list(page).getByRole('button', {name: /^Remind me today at 09:00$/}).click();
		await settled(page);
		expect((await todos.client.projects())[0]!.reminder.kind).not.toBe('none');
		expect(await page.locator('main').getByRole('button', {name: 'Reminder', exact: true}).textContent()).toContain('Today 09:00');
	});

	test("set from a Thread's page, it shows its day and time there", async ({page, todos}) => {
		const thread = await todos.client.create('Plan the garden');
		await open(page, todos, `threads/${thread.id}/page`);
		await page.getByRole('button', {name: 'Reminder', exact: true}).filter({visible: true}).click();
		await list(page).getByRole('button', {name: /^Remind me today at 09:00$/}).click();
		await settled(page);
		expect((await todos.client.thread(thread.id)).reminder.kind).not.toBe('none');
	});

	test("due on a Thread, opening it from the bell opens the Thread's page and uses it up", async ({page, todos}) => {
		const thread = await todos.client.create('Plan the garden');
		await todos.client.edit(thread.id, {reminder: {kind: 'set', at: '2020-01-01T09:00:00.000Z'}});
		await open(page, todos, 'inbox');
		expect(await dueDot(page).count()).toBe(1);
		await bell(page).filter({visible: true}).click();
		await list(page).locator(`[data-reminder="${thread.id}"]`).getByText('Plan the garden').click();
		await settled(page);
		expect((await todos.client.thread(thread.id)).reminder).toEqual({kind: 'none'});
		expect(page.url()).toContain(`#threads/${thread.id}/page`);
	});

	test('due on a project, opening it from the bell opens its page and uses it up', async ({page, todos}) => {
		const project = await todos.client.createProject({title: 'Move flat'});
		await todos.client.editProject(project.id, {reminder: {kind: 'set', at: '2020-01-01T09:00:00.000Z'}});
		await open(page, todos, 'inbox');
		await bell(page).filter({visible: true}).click();
		await list(page).locator(`[data-reminder="${project.id}"]`).getByText('Move flat').click();
		await settled(page);
		expect((await todos.client.projects())[0]!.reminder).toEqual({kind: 'none'});
		expect(page.url()).toContain(`#project/${project.id}`);
	});
});
