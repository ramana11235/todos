import type {Locator, Page} from '@playwright/test';
import {expect, open, settled, test} from './todos.js';

const inSidebar = (page: Page, title: string) => page.locator('[data-sidebar="menu-button"]', {hasText: title});
const heading = (page: Page, title: string) => page.locator('main h2', {hasText: title});
const picker = (page: Page) => page.locator('[data-slot="popover-content"]');

// Moves the mouse from one element to another in steps, as a hand does.
async function dragTo(page: Page, from: Locator, to: Locator) {
	const a = (await from.boundingBox())!;
	const b = (await to.boundingBox())!;
	await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
	await page.mouse.down();
	await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, {steps: 2});
	await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps: 10});
	await page.mouse.up();
}

test.describe("a project's When", () => {
	test('putting a project in Someday from its page shows it in Someday', async ({page, todos}) => {
		const garden = await todos.client.createProject({title: 'Redo the garden'});
		await open(page, todos, `project/${garden.id}`);
		await page.locator('main').getByRole('button', {name: 'Active'}).click();
		await picker(page).getByRole('button', {name: 'Someday'}).click();
		await settled(page);
		expect((await todos.client.projects()).find(p => p.id === garden.id)!.when).toEqual({kind: 'someday'});
		await open(page, todos, 'someday');
		expect(await heading(page, 'Redo the garden').count()).toBe(1);
	});

	test('a project in Someday opens from its heading there and comes back into Active', async ({page, todos, isMobile}) => {
		const garden = await todos.client.createProject({title: 'Redo the garden', when: {kind: 'someday'}});
		await open(page, todos, 'someday');
		if (!isMobile) expect(await inSidebar(page, 'Redo the garden').count()).toBe(0);
		await heading(page, 'Redo the garden').getByRole('button').click();
		await settled(page);
		await page.locator('main').getByRole('button', {name: 'Someday'}).click();
		await picker(page).getByRole('button', {name: 'Active'}).click();
		await settled(page);
		expect((await todos.client.projects()).find(p => p.id === garden.id)!.when).toEqual({kind: 'active'});
		if (!isMobile) expect(await inSidebar(page, 'Redo the garden').count()).toBe(1);
	});

	test('a project with a day ahead shows in Upcoming under that day', async ({page, todos}) => {
		await todos.client.createProject({title: 'Redo the garden', when: {kind: 'on_day', day: '2099-01-10'}});
		await open(page, todos, 'upcoming');
		expect(await heading(page, 'Redo the garden').count()).toBe(1);
	});

	test("a project in Someday leaves its Tasks where their own When puts them", async ({page, todos}) => {
		const garden = await todos.client.createProject({title: 'Redo the garden', when: {kind: 'someday'}});
		await todos.client.addTask({title: 'Buy compost', when: {kind: 'today'}, belongs: {kind: 'project', id: garden.id}});
		await open(page, todos, 'today');
		expect(await page.locator('[data-task]', {hasText: 'Buy compost'}).count()).toBe(1);
	});

	test('dragging a project onto Someday in the sidebar puts it in Someday', async ({page, todos, isMobile}) => {
		test.skip(isMobile, 'Projects are dragged in the sidebar on the laptop');
		const garden = await todos.client.createProject({title: 'Redo the garden'});
		await open(page, todos, 'today');
		await dragTo(page, inSidebar(page, 'Redo the garden'), page.locator('[data-list="someday"]'));
		await settled(page);
		expect((await todos.client.projects()).find(p => p.id === garden.id)!.when).toEqual({kind: 'someday'});
		expect(await inSidebar(page, 'Redo the garden').count()).toBe(0);
	});
});
