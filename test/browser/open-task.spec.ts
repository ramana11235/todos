import type {Page} from '@playwright/test';
import {expect, open, settled, test, type Todos} from './todos.js';

// The Task in its place on the page. A closing card leaves a copy of itself
// outside the page while it shrinks away, which is not the Task.
const card = (page: Page, id: string) => page.locator(`main [data-task="${id}"]`);

// A Task in Today, opened.
async function openTask(page: Page, todos: Todos, isMobile: boolean) {
	const task = await todos.client.addTask({title: 'Plant the beans', when: {kind: 'today'}});
	await open(page, todos, 'today');
	// The laptop opens a Task with a double click, and the phone with a tap.
	const title = card(page, task.id).getByText('Plant the beans');
	await (isMobile ? title.click() : title.dblclick());
	await settled(page);
	await expect(card(page, task.id).getByRole('button', {name: 'More'})).toBeVisible();
	return task;
}

// Picks an entry from the open Task's menu.
async function fromMenu(page: Page, id: string, entry: string) {
	await card(page, id).getByRole('button', {name: 'More'}).click();
	await page.getByRole('menuitem', {name: entry}).click();
}

// An open Task shows only When, Deadline and Checklist as buttons, and keeps
// everything else in its menu.
test.describe('an open Task', () => {
	test('an open Task shows When, Deadline and Checklist as buttons, and the rest only in its menu', async ({page, todos, isMobile}) => {
		const task = await openTask(page, todos, isMobile);
		for (const name of ['When', 'Deadline', 'Checklist']) await expect(card(page, task.id).getByRole('button', {name, exact: true})).toBeVisible();
		expect(await card(page, task.id).getByRole('button', {name: 'Turn into Thread'}).count()).toBe(0);
		await card(page, task.id).getByRole('button', {name: 'More'}).click();
		for (const name of ['Link to a Thread', 'Put in a project or area', 'Turn into Thread', 'Drop']) await expect(page.getByRole('menuitem', {name})).toBeVisible();
	});

	test('the Checklist button adds a step to the open Task', async ({page, todos, isMobile}) => {
		const task = await openTask(page, todos, isMobile);
		await card(page, task.id).getByRole('button', {name: 'Checklist'}).click();
		await card(page, task.id).getByPlaceholder('Step').fill('Soak the seeds');
		await card(page, task.id).getByPlaceholder('Step').press('Enter');
		await settled(page);
		expect((await todos.client.task(task.id)).checklist.map(s => s.title)).toEqual(['Soak the seeds']);
	});

	test("linking a Thread from the open Task's menu links the Task to it", async ({page, todos, isMobile}) => {
		const thread = await todos.client.create('Grow vegetables');
		const task = await openTask(page, todos, isMobile);
		await fromMenu(page, task.id, 'Link to a Thread');
		await page.locator('[data-slot="popover-content"]').getByRole('button', {name: 'Grow vegetables'}).click();
		await settled(page);
		expect((await todos.client.task(task.id)).threadId).toBe(thread.id);
	});

	test('putting the open Task in a project from its menu puts it there', async ({page, todos, isMobile}) => {
		const project = await todos.client.createProject({title: 'Allotment'});
		const task = await openTask(page, todos, isMobile);
		await fromMenu(page, task.id, 'Put in a project or area');
		await page.locator('[data-slot="popover-content"]').getByRole('button', {name: 'Allotment'}).click();
		await settled(page);
		expect((await todos.client.task(task.id)).belongs).toEqual({kind: 'project', id: project.id});
	});

	test('turning the open Task into a Thread from its menu makes a Thread of it', async ({page, todos, isMobile}) => {
		const task = await openTask(page, todos, isMobile);
		await fromMenu(page, task.id, 'Turn into Thread');
		await page.locator('[data-slot="popover-content"]').getByRole('button', {name: 'Top level'}).click();
		await settled(page);
		expect((await todos.client.threads()).map(t => t.title)).toEqual(['Plant the beans']);
	});
});

// The phone has no Alt+C, so a button at the top of every page captures.
test.describe('capture on the phone', () => {
	test.skip(({isMobile}) => !isMobile, 'Only the phone has the button');

	for (const place of ['today', 'threads']) {
		test(`the Inbox button on the ${place} page captures a Task into the Inbox`, async ({page, todos}) => {
			await open(page, todos, place);
			await page.getByRole('button', {name: 'Capture into the Inbox'}).click();
			await page.getByRole('dialog', {name: 'Capture'}).getByPlaceholder('Capture').fill('Call the plumber');
			await page.getByRole('dialog', {name: 'Capture'}).getByPlaceholder('Capture').press('Enter');
			await settled(page);
			const tasks = await todos.client.tasks();
			expect(tasks.map(t => [t.title, t.when.kind])).toEqual([['Call the plumber', 'inbox']]);
		});
	}

	test('leaving capture on the phone without pressing Enter adds nothing', async ({page, todos}) => {
		await open(page, todos, 'today');
		await page.getByRole('button', {name: 'Capture into the Inbox'}).click();
		await page.getByRole('dialog', {name: 'Capture'}).getByPlaceholder('Capture').fill('Call the plumber');
		await page.getByRole('dialog', {name: 'Capture'}).getByPlaceholder('Capture').blur();
		await settled(page);
		await expect(page.getByRole('dialog', {name: 'Capture'})).toHaveCount(0);
		expect(await todos.client.tasks()).toEqual([]);
	});
});
