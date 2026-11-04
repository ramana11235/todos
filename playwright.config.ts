import {defineConfig, devices} from '@playwright/test';

// Every browser test runs on a laptop-sized Chromium and on WebKit as an
// iPhone with touch. Each test starts its own Instance (test/browser/todos.ts),
// so no server is started here. A failed test is never run again, because a
// test that passes on a second try says nothing.
export default defineConfig({
	testDir: 'test/browser',
	retries: 0,
	fullyParallel: true,
	reporter: process.env.CI ? 'github' : 'list',
	use: {contextOptions: {reducedMotion: 'reduce'}},
	projects: [
		{name: 'laptop', use: {...devices['Desktop Chrome'], viewport: {width: 1280, height: 800}}},
		{name: 'phone', use: {...devices['iPhone 15']}},
	],
});
