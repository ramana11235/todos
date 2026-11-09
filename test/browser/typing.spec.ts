import {expect, open, settled, test} from './todos.js';

test.describe("what is typed into an open Task", () => {
	test('as Notes and then left by clicking outside the Task is saved', async ({page, todos}) => {
		const task = await todos.client.addTask({title: 'Make a list of furniture', when: {kind: 'anytime'}});
		await open(page, todos, 'anytime');
		const card = page.locator(`main [data-task="${task.id}"]`);
		await card.dblclick();
		await card.getByText('Notes').click();
		await card.getByPlaceholder('Notes').fill('A sofa and a desk');
		await page.locator('main h1').first().click();
		await settled(page);
		expect((await todos.client.task(task.id)).notes).toBe('A sofa and a desk');
	});

	test('as a new title and then left by clicking outside the Task is saved', async ({page, todos}) => {
		const task = await todos.client.addTask({title: 'Make a list', when: {kind: 'anytime'}});
		await open(page, todos, 'anytime');
		const card = page.locator(`main [data-task="${task.id}"]`);
		await card.dblclick();
		await card.locator('textarea').first().fill('Make a list of furniture');
		await page.locator('main h1').first().click();
		await settled(page);
		expect((await todos.client.task(task.id)).title).toBe('Make a list of furniture');
	});
});
