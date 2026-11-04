import type {Page} from '@playwright/test';
import {expect, open, settled, test, type Todos} from './todos.js';

const titles = (page: Page) => page.locator('main [data-task]').allTextContents();

// One Task done and one dropped, ended through the API.
async function oneDoneOneDropped(todos: Todos) {
	const done = await todos.client.addTask({title: 'Post the letter', when: {kind: 'today'}});
	const dropped = await todos.client.addTask({title: 'Repaint the fence', when: {kind: 'today'}});
	await todos.client.editTask(done.id, {ended: 'done'});
	await todos.client.editTask(dropped.id, {ended: 'dropped'});
	return {done, dropped};
}

// The Logbook lists Done Tasks and the Trash Dropped ones.
test.describe('the Logbook and the Trash', () => {
	test('a done Task is in the Logbook and not in the Trash', async ({page, todos}) => {
		await oneDoneOneDropped(todos);
		await open(page, todos, 'logbook');
		const logbook = (await titles(page)).join('|');
		expect(logbook).toContain('Post the letter');
		expect(logbook).not.toContain('Repaint the fence');
	});

	test('a dropped Task is in the Trash and not in the Logbook', async ({page, todos}) => {
		await oneDoneOneDropped(todos);
		await open(page, todos, 'trash');
		const trash = (await titles(page)).join('|');
		expect(trash).toContain('Repaint the fence');
		expect(trash).not.toContain('Post the letter');
	});

	test('opening a Task again from the Trash puts it back in its list', async ({page, todos}) => {
		const {dropped} = await oneDoneOneDropped(todos);
		await open(page, todos, 'trash');
		// shortcut: the drag library marks an ended Task's row aria-disabled, so
		// Playwright counts its button as disabled; force until #191 is fixed.
		await page.locator(`main [data-task="${dropped.id}"]`).getByRole('button', {name: 'Open again', exact: true}).click({force: true});
		await settled(page);
		expect((await todos.client.task(dropped.id)).ended).toBe('not_ended');
		await open(page, todos, 'today');
		expect((await titles(page)).join('|')).toContain('Repaint the fence');
	});
});

test.describe('the Trash in the sidebar', () => {
	test.skip(({isMobile}) => isMobile, 'The phone hides the sidebar during a drag');

	test('the Trash sits in the sidebar straight under the Logbook', async ({page, todos}) => {
		await open(page, todos, 'today');
		const places = await page.locator('[data-list]').evaluateAll(els => els.map(el => el.getAttribute('data-list')));
		expect(places.indexOf('trash')).toBe(places.indexOf('logbook') + 1);
	});

	test('dragging a Task onto the Trash drops it', async ({page, todos}) => {
		const task = await todos.client.addTask({title: 'Repaint the fence', when: {kind: 'today'}});
		await open(page, todos, 'today');
		const a = (await page.locator(`main [data-task="${task.id}"]`).boundingBox())!;
		const b = (await page.locator('[data-list="trash"]').boundingBox())!;
		await page.mouse.move(a.x + 60, a.y + a.height / 2);
		await page.mouse.down();
		await page.mouse.move(a.x + 70, a.y + a.height / 2, {steps: 2});
		await page.mouse.move(b.x + 40, b.y + b.height / 2, {steps: 10});
		await page.mouse.up();
		await settled(page);
		expect((await todos.client.task(task.id)).ended).toBe('dropped');
	});
});
