// How todos starts Claude for a Thread: with its Thread id in the
// environment, todos' hooks to report what the Session is doing, and todos'
// MCP server to keep the Thread true.

import {settingsPath} from '../config.js';
import type {SessionCommand} from './runner.js';

// The Claude Code hook events todos listens to, and the name each one goes
// by on the `todos hook` command.
export const hookEvents = {
	SessionStart: 'session-start',
	UserPromptSubmit: 'prompt',
	PreToolUse: 'tool-start',
	PostToolUse: 'tool-end',
	PostToolUseFailure: 'tool-end',
	PermissionRequest: 'permission',
	Notification: 'notification',
	Stop: 'stop',
	SessionEnd: 'session-end',
} as const;

export function claudeSettings(self: string[]): object {
	const hooks: Record<string, unknown> = {};
	for (const [event, name] of Object.entries(hookEvents)) {
		hooks[event] = [{hooks: [{type: 'command', command: shellLine([...self, 'hook', name])}]}];
	}
	return {
		hooks,
		// Without the allow, every update to the Thread would stop and ask me.
		// The settings file can hold the hosted Instance's service token, and
		// todos' MCP server reads it itself, so Claude has no reason to. A
		// Session misled by something it read then cannot read it with its own
		// tools, though a command it is allowed to run still could.
		permissions: {allow: ['mcp__todos'], deny: [`Read(/${settingsPath()})`, `Edit(/${settingsPath()})`]},
	};
}

export function claudeMcpConfig(self: string[], env: Record<string, string>): object {
	const [command, ...args] = self;
	return {mcpServers: {todos: {type: 'stdio', command, args: [...args, 'mcp'], env}}};
}

// The first prompt a new Session is given, so it reads up on its Thread and
// says it is ready, instead of sitting silent until I type. What "pick up"
// means is in the MCP server's instructions, so it works when I type it too.
export const firstPrompt = (title: string): string => `Pick up the todos Thread "${title}".`;

export function claudeCommand({self, apiUrl}: {self: string[]; apiUrl: string}): SessionCommand {
	return ({thread, sessionId, resume, prompt}) => {
		const env = {TODOS_THREAD: thread.id, TODOS_API_URL: apiUrl};
		const command = [
			'claude',
			...(resume ? ['--resume', sessionId] : ['--session-id', sessionId, '--name', thread.title]),
			'--settings', JSON.stringify(claudeSettings(self)),
			'--mcp-config', JSON.stringify(claudeMcpConfig(self, env)),
			// --mcp-config takes several files, so without -- it would read the
			// prompt as one more and Claude would exit at once.
			// A prompt sent from another Session comes first, as if I typed it.
			...(prompt ? ['--', prompt] : resume ? [] : ['--', firstPrompt(thread.title)]),
		];
		return {command, env};
	};
}

// The command that runs this same todos, whether it was built or is being
// run from source in development.
export const selfCommand = (): string[] => [process.execPath, ...process.execArgv, process.argv[1]!];

export const shellLine = (words: string[]): string => words.map(word => `'${word.replace(/'/g, `'\\''`)}'`).join(' ');
