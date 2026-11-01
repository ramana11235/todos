// Delivers the prompts kept in todos, from the laptop running Home
// (docs/adr/0003). A prompt is typed into its Session's pane once that
// Session can take it, and a Thread with no running Session gets one,
// started in the background with the prompt as its first.

import type {Client} from '../client/client.js';
import {directoryOf, type Thread} from '../core/thread.js';
import type {OpenResult} from './runner.js';

export type Delivery = {
	livePanes(): Set<string>;
	start(thread: Thread, directory: string, prompt?: string): OpenResult;
	type(pane: string, text: string): void;
};

export async function deliverPrompts(client: Client, delivery: Delivery): Promise<void> {
	const prompts = await client.prompts();
	if (prompts.length === 0) return;
	const threads = await client.threads();
	const live = delivery.livePanes();
	// One prompt per Thread each round, so they arrive in the order sent and
	// a Session just started is ready before the next one is typed.
	const done = new Set<string>();
	for (const prompt of prompts) {
		if (done.has(prompt.threadId)) continue;
		done.add(prompt.threadId);
		const thread = threads.find(candidate => candidate.id === prompt.threadId);
		if (thread && thread.sessionPane && live.has(thread.sessionPane)) {
			// No signal yet means it is still starting. While it is asking me
			// something, typed keys would answer its question.
			if (thread.sessionSignal === null || thread.sessionSignal === 'asking') continue;
			if (prompt.text) delivery.type(thread.sessionPane, prompt.text);
		} else if (thread) {
			const directory = directoryOf(threads, thread.id);
			// Sending refuses a Thread with no Directory, but one can be taken
			// away after; the prompt then waits until there is one again.
			if (!directory) continue;
			let started;
			try {
				started = delivery.start(thread, directory, prompt.text ?? undefined);
			} catch {
				// Most likely its Directory is not there, so it waits the same
				// way and is tried again next round.
				continue;
			}
			await client.recordSession(thread.id, started);
			// Its last signal is from a Session that has gone.
			await client.signal(thread.id, null);
		}
		await client.promptDelivered(prompt.id);
	}
}
