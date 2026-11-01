// Turns a Claude Code hook event from a Session into one change on its
// Thread. The Session's own states never reach the language; they only feed
// the Thread's state (CONTEXT.md).

import type {Client} from '../client/client.js';
import {dayOf} from '../core/task.js';
import {isActive, shownMove, type Thread} from '../core/thread.js';

export type HookName =
	| 'session-start'
	| 'prompt'
	| 'tool-start'
	| 'tool-end'
	| 'permission'
	| 'notification'
	| 'stop'
	| 'session-end';

// What the hook prints for Claude Code to read, if anything.
export type HookOutput = {stdout?: string};

export async function handleHook(
	name: HookName,
	input: any,
	{client, threadId}: {client: Client; threadId: string},
): Promise<HookOutput> {
	switch (name) {
		case 'session-start': {
			// A new id also arrives after /clear, and the newest is the one to resume.
			await client.recordSession(threadId, {claudeSessionId: input.session_id});
			await client.signal(threadId, 'finished');
			// Reading it as the Session marks my latest edits seen, so its first
			// update is not refused for changes it was just handed.
			const {thread} = await client.sessionView(threadId);
			// Handing the Session its Thread here means it knows what it is for
			// without spending a step reading it.
			return {stdout: JSON.stringify({hookSpecificOutput: {hookEventName: 'SessionStart', additionalContext: briefing(thread)}})};
		}
		case 'prompt':
			await client.signal(threadId, 'busy');
			return {};
		case 'tool-start':
			await client.signal(threadId, input.tool_name === 'AskUserQuestion' ? 'asking' : 'busy');
			return {};
		case 'tool-end':
			await client.signal(threadId, 'busy');
			return {};
		case 'permission':
			await client.signal(threadId, 'asking');
			return {};
		case 'notification':
			if (input.notification_type === 'permission_prompt' || input.notification_type === 'elicitation_dialog') {
				await client.signal(threadId, 'asking');
			}
			return {};
		case 'stop':
			await client.signal(threadId, 'finished');
			return {};
		case 'session-end':
			await client.signal(threadId, null);
			return {};
	}
}

// Claude Code hands over at most this much from a hook, and swaps anything
// longer for a short preview.
export const briefingLimit = 10_000;

export function briefing(thread: Thread): string {
	const lines = (notes: string) => [
		`You are the Session of the todos Thread "${thread.title}". This is it as it stands now:`,
		`Whose move: ${shownMove(thread).replace('_', ' ')}`,
		`When: ${thread.when.kind === 'on_day' && !isActive(thread, dayOf(new Date())) ? `back into Active on ${thread.when.day}` : thread.when.kind === 'someday' ? 'Someday' : 'Active'}`,
		...(thread.ended !== 'not_ended' ? [`Ended: ${thread.ended}`] : []),
		...(thread.deadline.kind === 'by_day' ? [`Deadline: ${thread.deadline.day}`] : []),
		`Summary: ${thread.summary || '(none yet)'}`,
		`Next step: ${thread.nextStep || '(none yet)'}`,
		...(thread.directory ? [`Directory: ${thread.directory}`] : []),
		'Use this to know what you are working on. Wait for my instruction before starting work.',
		'Notes, where the full detail of this Thread lives. Bring them up to date at milestones, and draw the summary from them:',
		notes || '(none yet)',
	].join('\n');
	const whole = lines(thread.notes);
	if (whole.length <= briefingLimit) return whole;
	const cut = '\n[The notes go on. Read the rest with get_thread.]';
	return lines(thread.notes.slice(0, thread.notes.length - (whole.length - briefingLimit) - cut.length) + cut);
}
