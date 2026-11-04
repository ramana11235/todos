import {down} from './touch.js';
import {expect, open, settled, test} from './todos.js';

// The phone's own rules for a finger: a swipe scrolls, a long press drags, and
// a right swipe pulls the sidebar out.
test.describe('touch on the phone', () => {
	test.skip(({isMobile}) => !isMobile, 'Only the phone has touch');

	test('a swipe up a list never starts a drag, and the list lets the browser scroll it', async ({page, todos}) => {
		await todos.client.addTask({title: 'Buy milk', when: {kind: 'today'}});
		await open(page, todos, 'today');
		await page.clock.install();
		await page.clock.pauseAt(Date.now() + 1000);
		const row = page.locator('[data-task]', {hasText: 'Buy milk'});
		const box = (await row.boundingBox())!;
		const finger = await down(page, box.x + 40, box.y + box.height / 2);
		await finger.move(box.x + 40, box.y - 60);
		await page.clock.runFor(1000);
		expect(await row.getAttribute('aria-pressed')).toBeNull();
		await finger.up();
		expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe('pan-y');
	});

	test('a long press on a Task starts a drag', async ({page, todos}) => {
		await todos.client.addTask({title: 'Buy milk', when: {kind: 'today'}});
		await open(page, todos, 'today');
		await page.clock.install();
		await page.clock.pauseAt(Date.now() + 1000);
		const row = page.locator('[data-task]', {hasText: 'Buy milk'});
		const box = (await row.boundingBox())!;
		const finger = await down(page, box.x + 40, box.y + box.height / 2);
		await page.clock.runFor(300);
		expect(await row.getAttribute('aria-pressed')).toBe('true');
		await finger.up();
	});
});
