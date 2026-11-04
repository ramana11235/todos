import {expect, open, settled, test} from './todos.js';

// The page shows a change at once and then saves it, so one that does not
// save must not go on looking saved.
test.describe('a change that does not save', () => {
	test('a tick that the API does not take goes back, and a message says it was not saved', async ({page, todos}) => {
		const task = await todos.client.addTask({title: 'Water the plants', when: {kind: 'today'}});
		await open(page, todos, 'today');
		// Every edit of a Task fails, as it would with no signal.
		await page.route(`**/api/tasks/${task.id}`, route => (route.request().method() === 'PATCH' ? route.abort() : route.continue()));
		const done = page.locator(`main [data-task="${task.id}"]`).getByRole('checkbox', {name: 'Done'});
		await done.click();
		await settled(page);
		await expect(done).not.toBeChecked();
		await expect(page.getByText('Could not save the change')).toBeVisible();
		expect((await todos.client.task(task.id)).ended).toBe('not_ended');
	});
});
