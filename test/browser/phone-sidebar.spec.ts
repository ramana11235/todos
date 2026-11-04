import type {Page} from '@playwright/test';
import {down} from './touch.js';
import {expect, open, settled, test} from './todos.js';

const popup = (page: Page) => page.locator('[data-mobile="true"][data-slot="sidebar"]');
const shift = (page: Page) => popup(page).evaluate(el => (el as HTMLElement).style.transform);
const width = (page: Page) => popup(page).evaluate(el => (el as HTMLElement).offsetWidth);

// The clock stands still while the finger moves, so how fast it moved is
// what the test says, not how fast the machine sent the events.
async function stillClock(page: Page) {
	await page.clock.install();
	await page.clock.pauseAt(Date.now() + 1000);
}

// The phone's sidebar comes out with a right swipe from anywhere on the page.
test.describe('the sidebar on the phone', () => {
	test.skip(({isMobile}) => !isMobile, 'Only the phone has the swipe');

	test('a right swipe from anywhere opens the sidebar, and the sidebar follows the finger', async ({page, todos}) => {
		await open(page, todos, 'today');
		await stillClock(page);
		const finger = await down(page, 100, 400);
		await finger.move(130, 402);
		await finger.move(200, 404);
		const w = await width(page);
		expect(await shift(page)).toBe(`translateX(${100 - w}px)`);
		await finger.move(250, 404);
		expect(await shift(page)).toBe(`translateX(${150 - w}px)`);
		await page.clock.resume();
		await finger.up();
		await settled(page);
		expect(await popup(page).getAttribute('data-open')).not.toBeNull();
	});

	test('a short pull that is let go slides the sidebar back from the finger', async ({page, todos}) => {
		await open(page, todos, 'today');
		await stillClock(page);
		const finger = await down(page, 100, 400);
		await finger.move(130, 400);
		await finger.move(160, 400);
		const w = await width(page);
		expect(await shift(page)).toBe(`translateX(${60 - w}px)`);
		// Held still before letting go, so it is not a flick.
		await page.clock.runFor(200);
		await finger.up();
		// It goes back from where the finger was, never jumping fully open first.
		expect(await shift(page)).toBe('translateX(-100%)');
		await page.clock.resume();
		await settled(page);
		expect(await popup(page).count()).toBe(0);
	});

	test('picking a place in the sidebar adds its history step only once the sidebar has closed', async ({page, todos}) => {
		await open(page, todos, 'today');
		await stillClock(page);
		const finger = await down(page, 100, 400);
		await finger.move(130, 400);
		await finger.move(300, 400);
		await page.clock.resume();
		await finger.up();
		await settled(page);
		const before = await page.evaluate(() => history.length);
		// Notes, for each step added, whether the sidebar was still moving.
		await page.evaluate(() => {
			const w = window as unknown as {steps: number[]};
			w.steps = [];
			const push = history.pushState.bind(history);
			history.pushState = (...args) => {
				w.steps.push(document.querySelector('[data-mobile="true"][data-slot="sidebar"]')?.getAnimations().length ?? 0);
				push(...args);
			};
		});
		await popup(page).getByRole('button', {name: 'Anytime'}).tap();
		await settled(page);
		expect(await page.evaluate(() => location.hash)).toBe('#anytime');
		expect(await page.evaluate(() => history.length)).toBe(before + 1);
		expect(await page.evaluate(() => (window as unknown as {steps: number[]}).steps)).toEqual([0]);
	});

	test('a sideways swipe on a code block leaves the sidebar shut', async ({page, todos}) => {
		await todos.client.addTask({title: 'Read the logs', when: {kind: 'today'}, notes: '```\na long line of code that scrolls sideways on a phone screen\n```'});
		await open(page, todos, 'today');
		await page.locator('[data-task]', {hasText: 'Read the logs'}).dblclick();
		await settled(page);
		const code = (await page.locator('pre').boundingBox())!;
		await stillClock(page);
		const finger = await down(page, code.x + 20, code.y + code.height / 2);
		await finger.move(code.x + 60, code.y + code.height / 2);
		await finger.move(code.x + 160, code.y + code.height / 2);
		await page.clock.resume();
		await finger.up();
		await settled(page);
		expect(await popup(page).count()).toBe(0);
	});
});
