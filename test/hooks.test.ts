import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {Client} from '../src/client/client.js';
import {shownMove} from '../src/core/thread.js';
import {briefingLimit, handleHook, type HookName} from '../src/hooks/handle.js';
import {startApi} from './support.js';

let client: Client;
let stop: () => Promise<void>;
let threadId: string;

// Shaped like the JSON Claude Code sends each hook on stdin.
const base = {session_id: '5f0c-session', transcript_path: '/tmp/x.jsonl', cwd: '/work/todos'};
const events: Record<string, object> = {
	sessionStart: {...base, hook_event_name: 'SessionStart', source: 'startup'},
	read: {...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {file_path: '/work/todos/README.md'}},
	prompt: {...base, hook_event_name: 'UserPromptSubmit', prompt: 'fix the typo'},
	bash: {...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {command: 'npm test'}},
	question: {...base, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: {}},
	toolDone: {...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {}, tool_response: {}},
	permission: {...base, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: {command: 'rm -rf build'}},
	idle: {...base, hook_event_name: 'Notification', message: 'Claude is waiting for your input', notification_type: 'idle_prompt'},
	permissionNote: {...base, hook_event_name: 'Notification', message: 'Claude needs your permission', notification_type: 'permission_prompt'},
	stop: {...base, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'Fixed.'},
	end: {...base, hook_event_name: 'SessionEnd', reason: 'exit'},
};

const hook = (name: HookName, input: object) => handleHook(name, input, {client, threadId});
const shown = async () => shownMove(await client.thread(threadId));

beforeEach(async () => {
	({client, stop} = await startApi());
	threadId = (await client.create('Build the MCP server')).id;
	await client.edit(threadId, {whoseMove: 'waiting'});
});

afterEach(() => stop());

describe('hooks', () => {
	it('records the Claude session id and hands the Session its Thread when it starts', async () => {
		await client.edit(threadId, {summary: 'Tools are done.', nextStep: 'Waiting on CI', notes: 'CI runs on every push.\nThe flaky test is in mcp.test.ts.'});
		const {stdout} = await hook('session-start', events.sessionStart!);
		const context = JSON.parse(stdout!).hookSpecificOutput.additionalContext;
		expect(context).toContain('"Build the MCP server"');
		expect(context).toContain('where the full detail of this Thread lives');
		expect(context).toContain('CI runs on every push.\nThe flaky test is in mcp.test.ts.');
		expect(context).toContain('Summary: Tools are done.');
		expect(context).toContain('Next step: Waiting on CI');
		expect(context).toContain('Whose move: waiting\nWhen: Active\n');
		expect(context).not.toContain('Deadline');
		expect((await client.thread(threadId)).claudeSessionId).toBe('5f0c-session');
		expect(await shown()).toBe('waiting');
		// It was handed my version, so its first update is not refused for it.
		expect((await client.sessionUpdate(threadId, {nextStep: 'Still waiting on CI'})).updated).toBe(true);
	});

	it('cuts long Notes to fit what Claude Code hands over, and says where the rest is', async () => {
		await client.edit(threadId, {notes: `Start.${'x'.repeat(briefingLimit)}The end.`});
		const {stdout} = await hook('session-start', events.sessionStart!);
		const context: string = JSON.parse(stdout!).hookSpecificOutput.additionalContext;
		expect(context.length).toBe(briefingLimit);
		expect(context).toContain('Start.');
		expect(context).not.toContain('The end.');
		expect(context.endsWith('Read the rest with get_thread.]')).toBe(true);
	});

	it('shows Working while the Session is busy', async () => {
		await hook('prompt', events.prompt!);
		expect(await shown()).toBe('working');
		await hook('tool-start', events.bash!);
		expect(await shown()).toBe('working');
	});

	it('shows On me while the Session asks for permission or asks me a question', async () => {
		await hook('prompt', events.prompt!);
		await hook('permission', events.permission!);
		expect(await shown()).toBe('on_me');
		await hook('tool-end', events.toolDone!);
		expect(await shown()).toBe('working');
		await hook('tool-start', events.question!);
		expect(await shown()).toBe('on_me');
		await hook('tool-end', events.toolDone!);
		await hook('notification', events.permissionNote!);
		expect(await shown()).toBe('on_me');
	});

	it('ignores the idle notification', async () => {
		await hook('prompt', events.prompt!);
		await hook('notification', events.idle!);
		expect(await shown()).toBe('working');
	});

	it('never blocks a stop, and adds nothing to the next prompt', async () => {
		await hook('prompt', events.prompt!);
		await hook('tool-start', events.bash!);
		expect(await hook('stop', events.stop!)).toEqual({});
		expect(await shown()).not.toBe('working');
		expect(await hook('prompt', events.prompt!)).toEqual({});
		expect(await shown()).toBe('working');
	});

	it('keeps the last whose move when the Session ends', async () => {
		await hook('prompt', events.prompt!);
		await hook('session-end', events.end!);
		expect(await shown()).toBe('waiting');
	});
});
