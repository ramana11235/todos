import {resolve} from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

// The web app is built into dist/web, where the API serves it. While
// developing, `npm run web` serves it with live reload and passes /api on to
// the running API.
export default defineConfig({
	root: import.meta.dirname,
	plugins: [react(), tailwindcss()],
	resolve: {alias: {'@': resolve(import.meta.dirname, 'src')}},
	build: {outDir: resolve(import.meta.dirname, '../dist/web'), emptyOutDir: true},
	server: {
		fs: {allow: [resolve(import.meta.dirname, '..')]},
		proxy: {'/api': process.env.TODOS_API_URL ?? `http://127.0.0.1:${process.env.TODOS_PORT ?? 7316}`},
	},
});
