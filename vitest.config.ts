import {defineConfig} from 'vitest/config';

// Every test runs on SQLite, and the tests of the storage and of everything
// built on it run again on a local D1, so both keep behaving the same.
export default defineConfig({
	test: {
		testTimeout: 20000,
		projects: [
			{
				extends: true,
				test: {
					name: 'sqlite',
					include: ['test/**/*.test.{ts,tsx}'],
					// Its lists of the API's fields are kept complete by the types.
					typecheck: {enabled: true, include: ['test/clients.test.ts'], tsconfig: './tsconfig.test.json'},
				},
			},
			{
				extends: true,
				test: {
					name: 'd1',
					include: ['test/{threads,tasks,mcp,hooks,reminders,push}.test.ts'],
					env: {TODOS_TEST_STORAGE: 'd1'},
				},
			},
		],
	},
});
