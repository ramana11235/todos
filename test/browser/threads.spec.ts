import type {Page} from '@playwright/test';
import {expect, open, settled, test, type Todos} from './todos.js';

// A Thread with one Task, shown on the Threads page.
async function threadWithTask(page: Page, todos: Todos) {
	const thread = await todos.client.create('Plan the garden');
	const task = await todos.client.addTask({title: 'Buy seeds', threadId: thread.id, when: {kind: 'anytime'}, notes: 'Ask about tomatoes'});
	await open(page, todos, `threads/${thread.id}`);
	return task;
}

// The Task in its place on the page. A closing card leaves a copy of itself
// outside the page while it shrinks away, which is not the Task.
const card = (page: Page, id: string) => page.locator(`main [data-task="${id}"]`);

// A Thread's Tasks on the Threads page open and work as they do in a list.
test.describe("a Thread's Tasks on the Threads page", () => {
	test('clicking a Task in a Thread opens it in place, with its Notes', async ({page, todos}) => {
		const task = await threadWithTask(page, todos);
		expect(await card(page, task.id).getByText('Ask about tomatoes').count()).toBe(0);
		await card(page, task.id).getByText('Buy seeds').click();
		await settled(page);
		expect(await card(page, task.id).getByText('Ask about tomatoes').count()).toBe(1);
	});

	test('ticking off an open Task in a Thread marks it done', async ({page, todos}) => {
		const task = await threadWithTask(page, todos);
		await card(page, task.id).getByText('Buy seeds').click();
		await settled(page);
		expect(await card(page, task.id).getByText('Ask about tomatoes').count()).toBe(1);
		await card(page, task.id).getByRole('checkbox', {name: 'Done'}).click();
		await settled(page);
		expect((await todos.client.task(task.id)).ended).toBe('done');
	});

	test('clicking outside an open Task in a Thread closes it', async ({page, todos}) => {
		const task = await threadWithTask(page, todos);
		await card(page, task.id).getByText('Buy seeds').click();
		await settled(page);
		expect(await card(page, task.id).getByText('Ask about tomatoes').count()).toBe(1);
		await page.getByText('Summary', {exact: true}).click();
		await settled(page);
		expect(await card(page, task.id).getByText('Ask about tomatoes').count()).toBe(0);
	});
});
