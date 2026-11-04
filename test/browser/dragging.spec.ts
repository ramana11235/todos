import type {Locator, Page} from '@playwright/test';
import {expect, open, settled, test} from './todos.js';

// Moves the mouse from one element to another in steps, as a hand does, so
// the drag starts and passes over what lies between.
async function dragTo(page: Page, from: Locator, to: Locator, {release = true} = {}) {
	const a = (await from.boundingBox())!;
	const b = (await to.boundingBox())!;
	await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
	await page.mouse.down();
	await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, {steps: 2});
	await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps: 10});
	if (release) await page.mouse.up();
}

const row = (page: Page, title: string) => page.locator('[data-task]', {hasText: title});
const inSidebar = (page: Page, title: string) => page.locator('[data-sidebar="menu-button"]', {hasText: title});

// On the phone the sidebar is put away while a list is on screen, so these
// drops onto it are for the laptop.
test.describe('dragging Tasks into the sidebar', () => {
	test.skip(({isMobile}) => isMobile, 'The phone hides the sidebar during a drag');

	test('dragging a Task onto a project in the sidebar puts it in that project', async ({page, todos}) => {
		const project = await todos.client.createProject({title: 'Plan the garden'});
		const task = await todos.client.addTask({title: 'Buy seeds', when: {kind: 'today'}});
		await open(page, todos, 'today');
		await dragTo(page, row(page, 'Buy seeds'), inSidebar(page, 'Plan the garden'));
		await settled(page);
		expect((await todos.client.task(task.id)).belongs).toEqual({kind: 'project', id: project.id});
	});

	test('dragging a Task onto an area in the sidebar puts it in that area', async ({page, todos}) => {
		const area = await todos.client.createArea({title: 'Health'});
		const task = await todos.client.addTask({title: 'Book the dentist', when: {kind: 'today'}});
		await open(page, todos, 'today');
		await dragTo(page, row(page, 'Book the dentist'), inSidebar(page, 'Health'));
		await settled(page);
		expect((await todos.client.task(task.id)).belongs).toEqual({kind: 'area', id: area.id});
	});

	test('a project in the sidebar shows it will take a Task while the Task is over it', async ({page, todos}) => {
		await todos.client.createProject({title: 'Plan the garden'});
		await todos.client.addTask({title: 'Buy seeds', when: {kind: 'today'}});
		await open(page, todos, 'today');
		const target = inSidebar(page, 'Plan the garden');
		const ringed = async () => (await target.getAttribute('class'))!.split(' ').includes('ring-2');
		expect(await ringed()).toBe(false);
		await dragTo(page, row(page, 'Buy seeds'), target, {release: false});
		expect(await ringed()).toBe(true);
		await page.mouse.up();
	});

	test('several selected Tasks dragged onto a project all go into it', async ({page, todos}) => {
		const project = await todos.client.createProject({title: 'Plan the garden'});
		const seeds = await todos.client.addTask({title: 'Buy seeds', when: {kind: 'today'}});
		const beds = await todos.client.addTask({title: 'Build the beds', when: {kind: 'today'}});
		await open(page, todos, 'today');
		await row(page, 'Buy seeds').click();
		await row(page, 'Build the beds').click({modifiers: ['ControlOrMeta']});
		await dragTo(page, row(page, 'Buy seeds'), inSidebar(page, 'Plan the garden'));
		await settled(page);
		for (const t of [seeds, beds]) expect((await todos.client.task(t.id)).belongs).toEqual({kind: 'project', id: project.id});
	});
});
