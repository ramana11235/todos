import {describe, expect, it} from 'vitest';
import type {Thread} from '../src/core/thread.js';
import {settingsPath} from '../src/config.js';
import {claudeCommand, firstPrompt} from '../src/session/claude-command.js';

const thread = {id: 't1', title: 'Add tasks to the terminal'} as Thread;
const start = claudeCommand({self: ['node', 'todos'], apiUrl: 'http://127.0.0.1:7316'});

describe('the claude command for a Session', () => {
	it('gives a new Session a first prompt so it reads up and says it is ready', () => {
		const {command} = start({thread, sessionId: 's1', resume: false});
		expect(command.at(-1)).toBe('Pick up the todos Thread "Add tasks to the terminal".');
		expect(command).toContain('--session-id');
		// Otherwise --mcp-config reads the prompt as another config file.
		expect(command.at(-2)).toBe('--');
	});

	it('gives a resumed Session no prompt, so it carries on where it was', () => {
		const {command} = start({thread, sessionId: 's1', resume: true});
		expect(command).not.toContain(firstPrompt(thread.title));
		expect(command.slice(0, 3)).toEqual(['claude', '--resume', 's1']);
	});

	it('puts a sent prompt first, whether the Session is new or resumed', () => {
		for (const resume of [false, true]) {
			const {command} = start({thread, sessionId: 's1', resume, prompt: 'Rerun CI'});
			expect(command.slice(-2)).toEqual(['--', 'Rerun CI']);
		}
	});

	it("stops the Session's own tools reading or changing the settings file, which can hold the service token", () => {
		const {command} = start({thread, sessionId: 's1', resume: false});
		const settings = JSON.parse(command[command.indexOf('--settings') + 1]!);
		expect(settings.permissions.deny).toEqual([`Read(/${settingsPath()})`, `Edit(/${settingsPath()})`]);
	});
});
