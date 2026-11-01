// What todos needs to know about Claude Code's saved conversations: whether
// one can be resumed, and which recent ones exist in a Directory.

import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const claudeHome = (): string => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');

// Claude Code keeps each Directory's conversations in a folder named after
// the Directory, with every character that is not a letter or digit as '-'.
const conversationsIn = (directory: string): string =>
	join(claudeHome(), 'projects', directory.replace(/[^a-zA-Z0-9]/g, '-'));

export function canResume(directory: string, sessionId: string): boolean {
	return existsSync(join(conversationsIn(directory), `${sessionId}.jsonl`));
}

export type PastSession = {id: string; firstPrompt: string; modifiedAt: Date};

export function recentSessions(directory: string, limit = 10): PastSession[] {
	const folder = conversationsIn(directory);
	if (!existsSync(folder)) return [];
	return readdirSync(folder)
		.filter(name => name.endsWith('.jsonl'))
		.map(name => ({name, modifiedAt: statSync(join(folder, name)).mtime}))
		.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
		.slice(0, limit)
		.map(({name, modifiedAt}) => ({
			id: name.replace(/\.jsonl$/, ''),
			firstPrompt: firstPrompt(join(folder, name)),
			modifiedAt,
		}))
		.filter(session => session.firstPrompt !== '');
}

function firstPrompt(path: string): string {
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		try {
			const entry = JSON.parse(line);
			if (entry.type !== 'user' || entry.isMeta) continue;
			const content = entry.message?.content;
			const text = typeof content === 'string' ? content : content?.find?.((part: any) => part.type === 'text')?.text;
			if (typeof text === 'string' && !text.startsWith('<')) return text.replace(/\s+/g, ' ').trim();
		} catch {
			// Not every line is a complete entry.
		}
	}
	return '';
}
