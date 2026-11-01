#!/usr/bin/env node
// The one `todos` command. With no arguments it opens Home; the other
// subcommands are what Home, the hooks and the MCP server run.

import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {render} from 'ink';
import {createApi} from './api/server.js';
import {apiAction, buildId, onNewBuild} from './build.js';
import {Client} from './client/client.js';
import {apiHeaders, apiPort, apiUrl, databasePath, settings, settingsPath, tmuxSocket, todosHome} from './config.js';
import {Projects} from './core/projects.js';
import {Tasks} from './core/tasks.js';
import {Thoughts} from './core/thoughts.js';
import {Threads} from './core/threads.js';
import type {List} from './core/task.js';
import {Capture} from './home/capture.js';
import {Home} from './home/home.js';
import {TaskPanel} from './home/task-panel.js';
import {colours} from './home/look.js';
import {nvimConfig} from './home/thoughts.js';
import {handleHook, type HookName} from './hooks/handle.js';
import {createMcpServer} from './mcp/server.js';
import {claudeCommand, selfCommand} from './session/claude-command.js';
import {canResume} from './session/claude-sessions.js';
import {deliverPrompts} from './session/deliver.js';
import {SessionRunner} from './session/runner.js';
import {homeWindow, tmuxConfig, tmuxSession} from './session/tmux-config.js';
import {minimumTmux, Tmux, tmuxIsNewEnough} from './session/tmux.js';
import {backup, backupHosted} from './storage/backup.js';
import {SqliteStorage} from './storage/sqlite.js';

const [command, ...args] = process.argv.slice(2);

function tmuxAndRunner() {
	mkdirSync(todosHome(), {recursive: true});
	const configPath = join(todosHome(), 'tmux.conf');
	writeFileSync(configPath, tmuxConfig(selfCommand()));
	const tmux = new Tmux(tmuxSocket(), configPath);
	const runner = new SessionRunner(tmux, claudeCommand({self: selfCommand(), apiUrl: apiUrl()}), canResume);
	return {tmux, runner, configPath};
}

// Makes sure the API is up and running this build. One running an older
// build is stopped and started again. The hosted API runs on Cloudflare, so
// there is nothing to start, and if it does not answer, Home says why.
async function ensureApi(client: Client): Promise<void> {
	if (settings().instance === 'hosted') return;
	const health = await client.health();
	const action = apiAction(health, {build: buildId(), home: todosHome()});
	if (action === 'use') return;
	if (action === 'refuse') {
		throw new Error(`Another copy of todos, with its data in ${health!.home}, is running at ${apiUrl()}. Set TODOS_API_URL or TODOS_PORT to give this copy its own address.`);
	}
	if (action === 'replace') await stopApi(client, health!.pid ?? listeningPid());
	const log = openSync(join(todosHome(), 'server.log'), 'a');
	const [node, ...rest] = selfCommand();
	spawn(node!, [...rest, 'serve'], {detached: true, stdio: ['ignore', log, log]}).unref();
	for (let tries = 0; tries < 50; tries++) {
		await new Promise(resolve => setTimeout(resolve, 100));
		if (await client.isUp()) return;
	}
	throw new Error(`The todos API did not start. See ${join(todosHome(), 'server.log')}`);
}

async function stopApi(client: Client, pid: number | null): Promise<void> {
	if (!pid) throw new Error(`An older todos API is running on port ${apiPort()} and could not be stopped.`);
	process.kill(pid);
	for (let tries = 0; tries < 50 && (await client.isUp()); tries++) await new Promise(resolve => setTimeout(resolve, 100));
}

// An API from before builds were tracked does not say its pid.
function listeningPid(): number | null {
	const result = spawnSync('lsof', ['-ti', `tcp:${apiPort()}`, '-sTCP:LISTEN'], {encoding: 'utf8'});
	return Number(result.stdout.trim().split('\n')[0]) || null;
}

// Every TODOS_ setting, carried along so what todos starts talks to the same
// copy of todos.
function todosEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) if (key.startsWith('TODOS_') && value) env[key] = value;
	return {...env, TODOS_API_URL: apiUrl()};
}

function homeStart(launchDir: string) {
	return {command: [...selfCommand(), 'home'], env: {...todosEnv(), TODOS_LAUNCH_DIR: launchDir}};
}

// An older tmux would fail later, at the first key that needs what it lacks,
// so todos says what it needs before it starts anything.
function checkTmux(): void {
	const result = spawnSync('tmux', ['-V'], {encoding: 'utf8'});
	if (!result.error && tmuxIsNewEnough(result.stdout)) return;
	const found = result.error ? 'tmux is not installed' : `this is ${result.stdout.trim()}`;
	console.error(`todos needs tmux ${minimumTmux} or later, and ${found}.`);
	process.exit(1);
}

async function open(): Promise<void> {
	checkTmux();
	const client = new Client(apiUrl(), apiHeaders());
	const {tmux, runner, configPath} = tmuxAndRunner();
	await ensureApi(client);
	if (runner.isRunning()) {
		tmux.run(['source-file', configPath]);
		if (runner.homeBuild() !== buildId()) runner.restartHome(homeStart(process.env.TODOS_LAUNCH_DIR ?? process.cwd()));
	}
	runner.ensureStarted({...homeStart(process.cwd()), directory: process.cwd()});
	runner.goHome();
	if (!tmux.insideThisServer()) tmux.attach(tmuxSession);
}

async function serve(): Promise<void> {
	// A local API would keep writing to the local file that the hosted
	// Instance has taken over from.
	if (settings().instance === 'hosted') throw new Error(`${settingsPath()} says this home uses the hosted Instance, so it runs no API of its own.`);
	mkdirSync(todosHome(), {recursive: true});
	const storage = new SqliteStorage(databasePath());
	const server = createApi(new Threads(storage), new Tasks(storage), new Thoughts(storage), new Projects(storage), {
		build: buildId(),
		home: todosHome(),
		// The web app is built next to this file, into dist/web.
		web: fileURLToPath(new URL('web', import.meta.url)),
	});
	// The API it replaces may still be letting go of the port.
	let tries = 0;
	server.on('error', (error: NodeJS.ErrnoException) => {
		if (error.code !== 'EADDRINUSE' || ++tries > 50) throw error;
		setTimeout(() => server.listen(apiPort(), '127.0.0.1'), 100);
	});
	server.listen(apiPort(), '127.0.0.1', () => console.log(`todos API on ${apiUrl()}, data in ${databasePath()}`));
	// When a new build lands, hand over to it.
	onNewBuild(() => {
		server.close(() => {
			const [node, ...rest] = selfCommand();
			spawn(node!, [...rest, 'serve'], {detached: true, stdio: 'inherit'}).unref();
			process.exit(0);
		});
		server.closeAllConnections();
	});
}

function home(): void {
	const {tmux, runner, configPath} = tmuxAndRunner();
	// A new build also brings a new tmux config, and Home is where it is
	// picked up, so a restarted Home always runs with the newest one.
	tmux.tryRun(['source-file', configPath]);
	runner.markHomeBuild(buildId());
	onNewBuild(() => runner.restartHome(homeStart(process.env.TODOS_LAUNCH_DIR ?? process.cwd())));
	const foldsPath = join(todosHome(), 'folded.json');
	const expand = (path: string) => path.replace(/^~(?=$|\/)/, homedir());
	// Home's process is the one on the laptop that delivers prompts. While no
	// terminal is attached it checks for them less often, since every check
	// is a request the hosted Instance counts. While I am at the laptop it
	// checks often, whichever window I am in, because a prompt from one
	// Session to another should arrive while I watch.
	const client = new Client(apiUrl(), apiHeaders());
	const shown = paneShown(tmux);
	const attached = () => tmux.tryRun(['display-message', '-p', '-t', tmuxSession, '#{session_attached}']) !== '0';
	let delivering = false;
	let ticks = 0;
	setInterval(() => {
		if (delivering || (++ticks % 10 !== 0 && !attached())) return;
		delivering = true;
		deliverPrompts(client, {
			livePanes: () => runner.livePanes(),
			start: (thread, directory, prompt) => runner.start(thread, expand(directory), prompt),
			type: (pane, text) => runner.type(pane, text),
		})
			.catch(() => {})
			.finally(() => (delivering = false));
	}, 1500);
	render(
		<Home
			client={client}
			open={(thread, directory) => runner.open(thread, expand(directory))}
			livePanes={() => runner.livePanes()}
			leave={() => tmux.tryRun(['detach-client', '-s', tmuxSession])}
			launchDir={process.env.TODOS_LAUNCH_DIR ?? process.cwd()}
			initialFolded={existsSync(foldsPath) ? JSON.parse(readFileSync(foldsPath, 'utf8')) : []}
			saveFolded={ids => writeFileSync(foldsPath, JSON.stringify(ids))}
			// The task panel's filter reads this to know the selected Thread.
			onSelect={id => tmux.tryRun(['set-option', '-w', '-t', homeWindow, '@todos_selected', id])}
			shown={shown}
		/>,
		{alternateScreen: true, exitOnCtrlC: false},
	);
}

// Whether this pane is on screen: its window is the one showing, and a
// terminal is attached to todos. Outside tmux it always counts as shown.
function paneShown(tmux: Tmux): () => boolean {
	const pane = process.env.TMUX_PANE;
	if (!pane) return () => true;
	return () => tmux.tryRun(['display-message', '-p', '-t', pane, '#{&&:#{session_attached},#{window_active}}']) !== '0';
}

function toggleTasks(window: string): void {
	const {runner} = tmuxAndRunner();
	runner.toggleTasks(window, {command: [...selfCommand(), 'tasks'], env: todosEnv()});
}

function tasks(): void {
	const {tmux} = tmuxAndRunner();
	const listPath = join(todosHome(), 'task-list.json');
	const thread = process.env.TODOS_THREAD;
	// Once the Session's pane has gone, the panel would be all that is left
	// of the Thread's window, so it closes too and the window with it.
	const pane = process.env.TMUX_PANE;
	if (thread && pane) {
		setInterval(() => {
			if (tmux.tryRun(['display-message', '-p', '-t', pane, '#{window_panes}']) === '1') process.exit(0);
		}, 1000);
	}
	render(
		<TaskPanel
			client={new Client(apiUrl(), apiHeaders())}
			currentThread={() => thread || tmux.tryRun(['show-options', '-wqv', '-t', homeWindow, '@todos_selected']) || null}
			initialList={existsSync(listPath) ? (JSON.parse(readFileSync(listPath, 'utf8')) as List) : undefined}
			saveList={list => writeFileSync(listPath, JSON.stringify(list))}
			shown={paneShown(tmux)}
		/>,
		{alternateScreen: true},
	);
}

function toggleThoughts(window: string): void {
	const {runner} = tmuxAndRunner();
	runner.toggleThoughts(window, {command: [...selfCommand(), 'thoughts'], env: todosEnv()});
}

// Runs nvim on Thoughts in its pane. nvim reads and saves the page through
// the two commands below.
function thoughts(): void {
	const {runner} = tmuxAndRunner();
	const pane = process.env.TMUX_PANE;
	if (pane) setInterval(() => runner.putAwayThoughtsIfAlone(pane), 1000);
	if (spawnSync('nvim', ['--version']).error) {
		const [r, g, b] = [1, 3, 5].map(i => parseInt(colours.faint.slice(i, i + 2), 16));
		process.stdout.write(`\n  \x1b[38;2;${r};${g};${b}mThoughts needs nvim, which is not installed. Any key closes this.\x1b[0m`);
		process.stdin.setRawMode?.(true);
		process.stdin.once('data', () => process.exit(0));
		return;
	}
	const configPath = join(todosHome(), 'thoughts.lua');
	writeFileSync(configPath, nvimConfig());
	const nvim = spawn('nvim', ['--clean', '-u', configPath, 'Thoughts.md'], {
		stdio: 'inherit',
		cwd: todosHome(),
		env: {...process.env, TODOS_SELF: JSON.stringify(selfCommand())},
	});
	nvim.on('exit', code => process.exit(code ?? 0));
}

async function readThoughts(): Promise<void> {
	process.stdout.write(JSON.stringify(await new Client(apiUrl(), apiHeaders()).thoughts()));
}

async function saveThoughts(version: string): Promise<void> {
	let text = '';
	for await (const chunk of process.stdin) text += chunk;
	process.stdout.write(JSON.stringify(await new Client(apiUrl(), apiHeaders()).saveThoughts(text, Number(version))));
}

async function hook(name: string): Promise<void> {
	const threadId = process.env.TODOS_THREAD;
	if (!threadId) return;
	let text = '';
	for await (const chunk of process.stdin) text += chunk;
	try {
		const output = await handleHook(name as HookName, text ? JSON.parse(text) : {}, {client: new Client(apiUrl(), apiHeaders()), threadId});
		if (output.stdout) process.stdout.write(output.stdout);
	} catch (error) {
		// A hook must never get in the way of the Session, so a failure is only
		// written down.
		mkdirSync(todosHome(), {recursive: true});
		writeFileSync(join(todosHome(), 'hooks.log'), `${new Date().toISOString()} ${name}: ${error}\n`, {flag: 'a'});
	}
}

async function mcp(): Promise<void> {
	const threadId = process.env.TODOS_THREAD;
	if (!threadId) throw new Error('todos mcp runs inside a Session started from Home');
	await createMcpServer({client: new Client(apiUrl(), apiHeaders()), threadId}).connect(new StdioServerTransport());
}

const usage = `todos            open Home
todos serve      run the todos API
todos home       run Home (inside todos' tmux)
todos hook NAME  handle a Claude Code hook event
todos mcp        run the MCP server for a Session
todos tasks      run the task panel (inside todos' tmux)
todos toggle-tasks WINDOW  open or close the task panel
todos toggle-thoughts WINDOW  open or put away Thoughts
todos thoughts   run Thoughts in nvim (inside todos' tmux)
todos thoughts-read  print Thoughts, for nvim
todos thoughts-save VERSION  save Thoughts from stdin, for nvim
todos capture    run the capture popup
todos backup DIR copy the data into DIR, keeping the last 30 days (for a hosted home, a D1 export)`;

switch (command) {
	case undefined:
		await open();
		break;
	case 'serve':
		await serve();
		break;
	case 'home':
		home();
		break;
	case 'hook':
		await hook(args[0] ?? '');
		break;
	case 'mcp':
		await mcp();
		break;
	case 'tasks':
		tasks();
		break;
	case 'toggle-tasks':
		toggleTasks(args[0] ?? '');
		break;
	case 'toggle-thoughts':
		toggleThoughts(args[0] ?? '');
		break;
	case 'thoughts':
		thoughts();
		break;
	case 'thoughts-read':
		await readThoughts();
		break;
	case 'thoughts-save':
		await saveThoughts(args[0] ?? '');
		break;
	case 'capture':
		render(<Capture client={new Client(apiUrl(), apiHeaders())} />);
		break;
	case 'backup':
		if (!args[0]) throw new Error('todos backup needs a folder to copy into');
		// A hosted home's local file stopped changing when it moved to the
		// hosted Instance, so its backup is the hosted data.
		console.log(settings().instance === 'hosted' ? backupHosted(args[0]) : backup(databasePath(), args[0]));
		break;
	default:
		console.log(usage);
		process.exitCode = command === 'help' || command === '--help' ? 0 : 1;
}
