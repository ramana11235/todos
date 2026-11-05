// The tools a Session uses to keep its own Thread true and to act for me on
// any other Thread or Task. Each acts on its own Thread unless another is
// named. It can read my Thoughts but never write them (CONTEXT.md).

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {batchLimit, turnsIntoThreadsLimit, type BatchRequest} from '../api/api.js';
import {ApiError, type Client} from '../client/client.js';
import {belongingOrder, taskBelongs, threadBelongs, type Area, type Project} from '../core/project.js';
import {dayOf, listOf, listRows, lists, places, type Place, type Task} from '../core/task.js';
import {directoryOf, shownMove, treeRows, type Thread} from '../core/thread.js';

const instructions = `This Claude session is the Session of one todos Thread. A Thread is an outcome being worked towards. It has a title, notes, a summary, a next step, whose move it is, when it is for, whether it has ended, and can have a deadline.

Write them like this:
- notes: the full detail of the Thread, and where everything about it lives. Write everything a later Session needs to pick up the work without your conversation: what it is for, what was decided and why, where things stand, what is left, links, files and anything surprising. Plain text in any shape. Another Session only learns what is in the notes.
- summary: drawn from the notes, for the user to take in at a glance. A few short bullet points in simple words, saying only what matters to the user. Never put anything in it that the notes do not say. Include links to anything worth finding again, such as a pull request.
- next step: one short sentence naming the single next piece of work that moves the Thread forward, such as building an issue or a grilling session, not the next small step within it. When the Thread is waiting, say who or what it waits on, such as "Waiting on the solicitor to get back to me".
- whose move: on_me when the next step is the user's, or yours, because nothing happens after your reply until the user prompts you again. waiting when it belongs to someone or something else, such as a person, CI or a delivery.

Every update costs tokens and a request, so update your Thread with update_thread without being asked only at milestones: when a piece of work or an issue lands, when a planning or grilling session ends, when the Thread starts or stops waiting, when the next step passes between you and the user, and when you make something worth linking. A small decision, such as one answer in a session that asks one question at a time, is not a milestone; write it in the repo's own files, such as the issue being worked on. Every update changes the notes first and then rewrites the whole summary from them. Usually change only the passage that moved with note_edits, each replacing an exact piece of the notes, as with the Edit tool. Rewrite the notes whole when you reach a point worth picking up from, and before you stop for the user's feedback on finished work, such as a built issue or a prototype to try. A question to the user in the middle of the work is not such a stop. If the Thread has no notes or summary yet, write them. When nothing about where it stands has changed, leave it alone. If the user wrote something in the summary that the notes do not say, carry it into the notes.

Every extra step rereads the whole conversation, so keep updates cheap: call update_thread alongside your last other tool call of a reply, in the same step, rather than in a step of its own, and do not read your Thread first. If the user changed it by hand since you last saw it, update_thread says so and shows you their version, notes and all; keep their changes and call it again.

Only the user decides when a Thread is for and whether it has ended. When is Active (being worked on now), Someday (not now) or a day on which it comes back into Active. When the user tells you to, such as "park it for someday", "bring it back on Monday", "mark it done" or "drop it", set when or ended, and when it ends write a summary that says how it ended. Never set them on your own: when you think the Thread is finished, say so in the next step and set whose move to on_me. Set a deadline only from a day the user gave you.

When the user says "pick up" the Thread, or you are started with that, get fully up to speed before doing anything else. Read the notes, summary and next step you were handed, then open every issue, file and link they mention, and look at the recent commits and any uncommitted changes in your directory. Then reply in a few lines: what the Thread is for, where it stands and what is next. Ask what the user needs, and do not start the work until they say.

You act for the user across all of todos. Every tool acts on your own Thread unless you name another by its id, which find_threads gives you. Outside your own Thread, act only when the user tells you to, and change only what they asked about. If you notice something about another Thread, tell the user rather than acting. Read other Threads only when the user asks something that needs them, and never bring them up yourself.

When the user names a Thread loosely, find it. If exactly one fits, act, then say in one line what you did, such as 'Dropped "Set up CI/CD with GitHub".' If several fit, or none, ask, listing them. Never ask "are you sure", because nothing is deleted and every change can be put back.

A new Thread's title starts with an action verb and says its purpose in a few words, and the work it is for goes in its notes, with its summary and next step drawn from them. Creating a Thread never starts its Session. You cannot start or prompt another Thread's Session, because a Session acts only on what the user types into it, and the user goes into a Thread from Home. When the user asks for a new session to do something, create the Thread and say it is ready to go into from Home.

When two Threads turn out to be the same outcome, move one's children and open Tasks to the other, write what matters from it into the other, and drop it with a summary naming the one that kept going.

If your directory has changes that are not yours, ask the user before touching them. You never read another Session's conversation; you learn about its Thread from its notes, summary and next step.

When the user asks you to add a Task, use add_task. A Task is a single action. Start it with an action verb and keep it very short, such as "Call the landlord". It goes on your own Thread, which puts it in Anytime, unless the user says otherwise. The user acts on Tasks and does not open your files, so a Task you make for them, such as a check only they can do, carries everything the user needs to do it, step by step, in its notes.

A project is an outcome made of Threads and Tasks, such as Build todos, and an area is a part of the user's life that is never finished, such as Health. A Thread at the top of its tree, or a Task with no Thread, can belong to one of them with belongs_to; the Threads under it belong where it does, and a Task on a Thread belongs where its Thread does. find_projects lists them with their ids. Create, change, end or put things in them only when the user tells you to.

Thoughts is the user's own page of thinking that is still forming, not about any one Thread. Read it with get_thoughts only when the user asks you to, such as "read my Thoughts on the web app". You cannot change it.`;

const text = (value: unknown) => ({content: [{type: 'text' as const, text: JSON.stringify(value, null, 2)}]});

const describe = (thread: Thread) => ({
	title: thread.title,
	shownMove: shownMove(thread),
	when: thread.when,
	ended: thread.ended,
	deadline: thread.deadline,
	summary: thread.summary,
	nextStep: thread.nextStep,
});

// As with Threads, the notes and checklist are long, so only reading one Task
// shows them.
const describeTask = (task: Task, threads: Thread[], today: string) => {
	const owner = threads.find(candidate => candidate.id === task.threadId);
	return {
		id: task.id, title: task.title, list: listOf(task, today), when: task.when, deadline: task.deadline, ended: task.ended,
		thread: owner ? {id: owner.id, title: owner.title} : null, belongsTo: taskBelongs(task, threads),
	};
};

// The notes are long, so only reading one Thread shows them.
const withNotes = (thread: Thread) => ({...describe(thread), notes: thread.notes});

const noteEdits = z
	.array(z.object({old: z.string().describe('An exact piece of the notes, found only once.'), new: z.string()}))
	.optional()
	.describe('Changes to passages of the notes, applied in order after notes if both are given.');

const threadArg = z.string().optional().describe('The id of the Thread, from find_threads. Leave it out for your own.');
const day = z.string().describe('A day such as 2026-11-02.');

const deadline = z
	.discriminatedUnion('kind', [z.object({kind: z.literal('none')}), z.object({kind: z.literal('by_day'), day})])
	.optional()
	.describe('A day by which it must be done, only from a day the user gave you. none to take it away.');

const belongsTo = z
	.discriminatedUnion('kind', [z.object({kind: z.literal('none')}), z.object({kind: z.literal('project'), id: z.string()}), z.object({kind: z.literal('area'), id: z.string()})])
	.optional()
	.describe('The project or area it belongs to, by its id from find_projects, or none. Only when the user tells you to.');

const editedByUser = 'The user changed this Thread by hand since you last saw it. Keep their changes and update it again.';

// The inputs of the tools that change things, which batch takes as they are.
const createThreadInput = {
	title: z.string().describe('An action verb first, then its purpose in a few words, such as "Set up the domain".'),
	parent: z.string().nullable().optional().describe('The id of its parent, null for the top level. Leave it out for under your own Thread.'),
	notes: z.string().optional().describe('Everything its Session will need to pick up the work, since it never sees your conversation.'),
	summary: z.string().optional().describe('Drawn from the notes: a few short bullet points in simple words.'),
	next_step: z.string().optional(),
	position: z.number().int().min(0).optional().describe('Where among its siblings, 0 for first. Leave it out for last.'),
	belongs_to: belongsTo.describe('The project or area it belongs to, only for a Thread at the top level.'),
};

const updateThreadInput = {
	thread: threadArg,
	title: z.string().optional(),
	notes: z.string().optional().describe('The whole notes, replacing the old ones.'),
	note_edits: noteEdits,
	summary: z.string().optional().describe('Drawn from the notes: a few short bullet points in simple words.'),
	next_step: z.string().optional().describe('One short sentence naming the single next thing. For a waiting Thread, who or what it waits on.'),
	whose_move: z.enum(['on_me', 'waiting']).optional().describe("on_me if the next step is the user's or yours; waiting if it belongs to someone or something else."),
	when: z
		.discriminatedUnion('kind', [z.object({kind: z.literal('active')}), z.object({kind: z.literal('someday')}), z.object({kind: z.literal('on_day'), day})])
		.optional()
		.describe('Active to work on it now, someday for not now, or on_day to bring it back into Active on that day. Only when the user tells you to.'),
	ended: z.enum(['not_ended', 'done', 'dropped']).optional().describe('done or dropped only when the user tells you to; not_ended reopens it.'),
	deadline,
	belongs_to: belongsTo.describe('The project or area it belongs to, only for a Thread at the top level; the Threads under it belong where it does.'),
	directory: z.string().nullable().optional().describe('Where its Session works. null to use its parent\'s.'),
};

const moveThreadInput = {
	thread: z.string().describe('The id of the Thread to move.'),
	parent: z.string().nullable().describe('The id of its new parent, or null for the top level.'),
	position: z.number().int().min(0).optional().describe('Where among its new siblings, 0 for first. Leave it out for last.'),
};

const taskWhen = z
	.union([z.object({kind: z.enum(places as [Place, ...Place[]])}), z.object({kind: z.literal('on_day'), day})])
	.optional();
const checklist = z
	.array(z.object({id: z.string().optional().describe('Keep it for a step that stays.'), title: z.string(), done: z.boolean().optional()}))
	.optional()
	.describe('The whole checklist, replacing the one there. Read it with get_task first, and keep the id of each step that stays.');

const addTaskInput = {
	title: z.string().describe('A single action, starting with an action verb and very short, such as "Call the landlord".'),
	when: taskWhen.describe('The list it goes in, or on_day for the day it moves into Today. Leave it out for the Inbox, or for Anytime when it has a Thread, project or area, since a Task that belongs somewhere is never in the Inbox. Only set it when the user says.'),
	thread: z.string().nullable().optional().describe('The id of the Thread, or null for no Thread. Leave it out for your own.'),
	belongs_to: belongsTo.describe('The project or area it belongs to, for a Task with thread null.'),
	notes: z.string().optional().describe('Everything the user needs to do it, step by step, when you make it for them.'),
	deadline,
	checklist,
	position: z.number().int().min(0).optional().describe('Where among the Tasks of its list and Thread, as find_tasks lists them, 0 for first. Not in Upcoming, which is in date order.'),
};

const editTaskInput = {
	task: z.string().describe('The id of the Task, from find_tasks.'),
	title: z.string().optional(),
	when: taskWhen.describe('The list it goes in, or on_day for the day it moves into Today.'),
	thread: z.string().nullable().optional().describe('The id of its Thread, or null for none. Linking it to a Thread takes it out of its project or area. A Task linked to a Thread, project or area is never in the Inbox, so linking one moves it to Anytime.'),
	belongs_to: belongsTo.describe('The project or area it belongs to, which takes it off its Thread.'),
	notes: z.string().optional().describe('The whole notes, replacing the old ones.'),
	deadline,
	checklist,
	position: z.number().int().min(0).optional().describe('Where among the Tasks of its list and Thread, as find_tasks lists them, 0 for first. Not in Upcoming, which is in date order.'),
	ended: z.enum(['not_ended', 'done', 'dropped']).optional().describe('not_ended reopens it.'),
};

const turnTaskIntoThreadInput = {
	task: z.string().describe('The id of the Task, from find_tasks.'),
	parent: z.string().nullable().optional().describe('The id of the new Thread\'s parent, null for the top level. Leave it out for under the Thread the Task is linked to.'),
};

const createAreaInput = {
	title: z.string().describe('A part of the user\'s life, such as "Health".'),
	notes: z.string().optional(),
};

const updateAreaInput = {
	area: z.string().describe('The id of the area, from find_projects.'),
	title: z.string().optional(),
	notes: z.string().optional().describe('The whole notes, replacing the old ones.'),
	ended: z.enum(['not_ended', 'dropped']).optional().describe('dropped only when the user tells you to; not_ended brings it back. An area is never done.'),
	position: z.number().int().min(0).optional().describe('Where among the areas, as find_projects lists them, 0 for first.'),
};

const createProjectInput = {
	title: z.string().describe('The outcome, starting with an action verb, such as "Build todos".'),
	notes: z.string().optional(),
	area: z.string().nullable().optional().describe('The id of the area it is in, from find_projects. Leave it out for none.'),
	deadline,
};

const updateProjectInput = {
	project: z.string().describe('The id of the project, from find_projects.'),
	title: z.string().optional(),
	notes: z.string().optional().describe('The whole notes, replacing the old ones.'),
	area: z.string().nullable().optional().describe('The id of the area it is in, or null for none.'),
	deadline,
	ended: z.enum(['not_ended', 'done', 'dropped']).optional().describe('done or dropped only when the user tells you to; not_ended reopens it. Nothing inside it changes.'),
	position: z.number().int().min(0).optional().describe('Where among the projects of its area, or of those in no area, as find_projects lists them, 0 for first.'),
};

// An area id as the API takes it.
const inArea = (area: string | null | undefined) => (area === undefined ? undefined : area === null ? {kind: 'none'} : {kind: 'in', id: area});

const changeInput = z.discriminatedUnion('tool', [
	z.object({tool: z.literal('create_thread'), ...createThreadInput}),
	z.object({tool: z.literal('update_thread'), ...updateThreadInput}),
	z.object({tool: z.literal('move_thread'), ...moveThreadInput}),
	z.object({tool: z.literal('add_task'), ...addTaskInput}),
	z.object({tool: z.literal('edit_task'), ...editTaskInput}),
	z.object({tool: z.literal('turn_task_into_thread'), ...turnTaskIntoThreadInput}),
	z.object({tool: z.literal('create_area'), ...createAreaInput}),
	z.object({tool: z.literal('update_area'), ...updateAreaInput}),
	z.object({tool: z.literal('create_project'), ...createProjectInput}),
	z.object({tool: z.literal('update_project'), ...updateProjectInput}),
]);

export function createMcpServer({client, threadId}: {client: Client; threadId: string}): McpServer {
	const server = new McpServer({name: 'todos', version: '0.1.0'}, {instructions});

	server.registerTool(
		'find_threads',
		{
			description: 'Find Threads anywhere, including Someday, Done and Dropped ones, by words in their title, summary or next step. Leave the query out to list every Thread in tree order.',
			inputSchema: {query: z.string().optional()},
		},
		async ({query}) => {
			const words = query?.toLowerCase();
			const threads = await client.threads();
			const rows = treeRows(threads, {view: 'all', today: dayOf(new Date())}).filter(
				({thread}) => !words || [thread.title, thread.summary, thread.nextStep].some(field => field.toLowerCase().includes(words)),
			);
			const parentOf = (thread: Thread) => threads.find(candidate => candidate.id === thread.parentId)?.title ?? null;
			return text(rows.map(row => ({
				id: row.thread.id,
				depth: row.depth,
				parent: parentOf(row.thread),
				...describe(row.thread),
				belongsTo: threadBelongs(row.thread, threads),
				...(row.thread.id === threadId && {yours: true}),
			})));
		},
	);

	server.registerTool(
		'get_thread',
		{description: 'Read a Thread. For your own it also says whether the user edited it since your last update.', inputSchema: {thread: threadArg}},
		async ({thread = threadId}) => {
			if (thread !== threadId) return text({id: thread, ...withNotes(await client.thread(thread))});
			const view = await client.sessionView(threadId);
			return text({
				...withNotes(view.thread),
				editedByUserSinceYourLastUpdate: view.editedByMeSinceYourLastUpdate,
				...(view.editedByMeSinceYourLastUpdate && {note: 'The user changed this Thread by hand. Keep their changes when you next update it.'}),
			});
		},
	);

	server.registerTool(
		'update_thread',
		{
			description: 'Change a Thread, touching only the fields given. For your own, call it at milestones, as the server instructions say: change the notes, then rewrite the whole summary from them.',
			inputSchema: updateThreadInput,
		},
		async change => {
			try {
				// Another Thread answers with the Thread, and my own with whether
				// the update was saved.
				const result = await client.send<{updated?: boolean; thread: Thread}>(requestFor({tool: 'update_thread', ...change}));
				if (result.updated === false) {
					return {...text({error: editedByUser, theirVersion: withNotes(result.thread)}), isError: true};
				}
				return text({updated: true});
			} catch (error) {
				// A note edit that did not fit saved nothing, so show the notes
				// as they are for the next try.
				if (!(error instanceof ApiError) || error.status !== 400) throw error;
				return {...text({error: `Nothing was saved. ${error.message}`, notes: (await client.thread(change.thread ?? threadId)).notes}), isError: true};
			}
		},
	);

	server.registerTool(
		'create_thread',
		{
			description: 'Create a Thread, under your own unless another parent is given. It starts with no Session.',
			inputSchema: createThreadInput,
		},
		async change => {
			const created = await client.send<Thread>(requestFor({tool: 'create_thread', ...change}));
			return text({id: created.id});
		},
	);

	server.registerTool(
		'move_thread',
		{
			description: 'Move a Thread, with its children, Tasks and Session, under another Thread or to the top level.',
			inputSchema: moveThreadInput,
		},
		async change => {
			await client.send(requestFor({tool: 'move_thread', ...change}));
			return text({moved: true});
		},
	);

	server.registerTool(
		'find_tasks',
		{
			description: 'Find Tasks by words in their title, on one Thread or across all of them. Open ones unless ended is asked for; done and dropped ones come most recently ended first.',
			inputSchema: {
				query: z.string().optional(),
				thread: z.string().optional().describe('The id of a Thread to look only on.'),
				ended: z.enum(['not_ended', 'done', 'dropped']).optional().describe('Leave it out for open Tasks.'),
			},
		},
		async ({query, thread, ended = 'not_ended'}) => {
			const open = ended === 'not_ended';
			const [tasks, threads, projects, areas] = await Promise.all([open ? client.tasks() : client.logbook(), client.threads(), open ? client.projects() : [], open ? client.areas() : []]);
			const words = query?.toLowerCase();
			const today = dayOf(new Date());
			// Open Tasks in the order I see them, list by list.
			const order = belongingOrder(projects, areas);
			const ordered = open ? lists.flatMap(list => listRows(tasks, threads, list, today, order).flatMap(row => (row.kind === 'task' ? [row.task] : []))) : tasks;
			const found = ordered.filter(task => task.ended === ended && (!thread || task.threadId === thread) && (!words || task.title.toLowerCase().includes(words)));
			return text(found.map(task => describeTask(task, threads, today)));
		},
	);

	server.registerTool(
		'get_task',
		{description: 'Read a Task whole, with its notes and its checklist.', inputSchema: {task: z.string().describe('The id of the Task, from find_tasks.')}},
		async ({task}) => {
			const [found, threads] = await Promise.all([client.task(task), client.threads()]);
			return text({...describeTask(found, threads, dayOf(new Date())), notes: found.notes, checklist: found.checklist});
		},
	);

	server.registerTool(
		'add_task',
		{
			description: 'Add a Task, to your own Thread unless another is named.',
			inputSchema: addTaskInput,
		},
		async change => {
			const task = await client.send<Task>(requestFor({tool: 'add_task', ...change}));
			return text({added: true, id: task.id});
		},
	);

	server.registerTool(
		'edit_task',
		{
			description: 'Change a Task, touching only the fields given.',
			inputSchema: editTaskInput,
		},
		async change => {
			await client.send(requestFor({tool: 'edit_task', ...change}));
			return text({updated: true});
		},
	);

	server.registerTool(
		'turn_task_into_thread',
		{
			description: 'Turn a Task into a Thread. The Thread takes its title, notes, deadline and when, each checklist step becomes a Task on it, and the Task is gone.',
			inputSchema: turnTaskIntoThreadInput,
		},
		async change => {
			const thread = await client.send<Thread>(requestFor({tool: 'turn_task_into_thread', ...change}));
			return text({id: thread.id});
		},
	);

	server.registerTool(
		'find_projects',
		{
			description: 'List every area and project, including dropped and done ones, with their ids. Each project says which area it is in.',
			inputSchema: {query: z.string().optional().describe('Words in the title, to list only the ones that match.')},
		},
		async ({query}) => {
			const words = query?.toLowerCase();
			const [areas, projects] = await Promise.all([client.areas(), client.projects()]);
			const matches = (one: Area | Project) => !words || one.title.toLowerCase().includes(words);
			const byPosition = (a: {position: number}, b: {position: number}) => a.position - b.position;
			return text({
				areas: areas.filter(matches).sort(byPosition).map(({id, title, notes, ended}) => ({id, title, notes, ended})),
				projects: projects.filter(matches).sort(byPosition).map(({id, title, notes, area, deadline, ended}) => ({id, title, notes, area, deadline, ended})),
			});
		},
	);

	for (const [name, description, inputSchema] of [
		['create_area', 'Create an area, a part of the user\'s life that is never finished.', createAreaInput],
		['update_area', 'Change an area, touching only the fields given.', updateAreaInput],
		['create_project', 'Create a project, an outcome made of Threads and Tasks.', createProjectInput],
		['update_project', 'Change a project, touching only the fields given.', updateProjectInput],
	] as const) {
		server.registerTool(name, {description, inputSchema}, async (change: any) => {
			const saved = await client.send<{id: string}>(requestFor({tool: name, ...change}));
			return text({done: true, id: saved.id});
		});
	}

	// The one place each change becomes its request, sent alone by its own tool
	// or together by batch.
	const requestFor = (change: z.infer<typeof changeInput>): BatchRequest => {
		switch (change.tool) {
			case 'create_thread': {
				const {title, parent = threadId, notes, summary, next_step, position, belongs_to} = change;
				return {method: 'POST', path: '/api/threads', body: {title, parentId: parent, index: position, notes, summary, nextStep: next_step, belongs: belongs_to}};
			}
			case 'update_thread': {
				const {tool, thread = threadId, next_step, note_edits, whose_move, belongs_to, ...fields} = change;
				const body = {...fields, whoseMove: whose_move, nextStep: next_step, noteEdits: note_edits, belongs: belongs_to};
				return thread === threadId
					? {method: 'POST', path: `/api/threads/${thread}/session-update`, body}
					: {method: 'PATCH', path: `/api/threads/${thread}`, body};
			}
			case 'move_thread':
				return {method: 'POST', path: `/api/threads/${change.thread}/move`, body: {parentId: change.parent, index: change.position}};
			case 'add_task': {
				const {tool, title, thread = threadId, position, belongs_to, ...fields} = change;
				// A Task put in a project or area goes on no Thread, rather than on your own.
				const onThread = belongs_to && belongs_to.kind !== 'none' && change.thread === undefined ? null : thread;
				return {method: 'POST', path: '/api/tasks', body: {...fields, title, threadId: onThread, belongs: belongs_to, index: position}};
			}
			case 'edit_task': {
				const {tool, task, thread, position, belongs_to, ...fields} = change;
				return {method: 'PATCH', path: `/api/tasks/${task}`, body: {...fields, threadId: thread, belongs: belongs_to, index: position}};
			}
			case 'turn_task_into_thread':
				return {method: 'POST', path: `/api/tasks/${change.task}/thread`, body: {parentId: change.parent}};
			case 'create_area':
				return {method: 'POST', path: '/api/areas', body: {title: change.title, notes: change.notes}};
			case 'update_area': {
				const {tool, area, position, ...fields} = change;
				return {method: 'PATCH', path: `/api/areas/${area}`, body: {...fields, index: position}};
			}
			case 'create_project': {
				const {tool, area, ...fields} = change;
				return {method: 'POST', path: '/api/projects', body: {...fields, area: inArea(area)}};
			}
			case 'update_project': {
				const {tool, project, area, position, ...fields} = change;
				return {method: 'PATCH', path: `/api/projects/${project}`, body: {...fields, area: inArea(area), index: position}};
			}
		}
	};

	server.registerTool(
		'batch',
		{
			description:
				`Make up to ${batchLimit} changes in one call, in order, of which at most ${turnsIntoThreadsLimit} can be turn_task_into_thread. Each is written as its own tool takes it, with "tool" naming which: ` +
				'create_thread, update_thread, move_thread, add_task, edit_task, turn_task_into_thread, create_area, update_area, create_project or update_project. Results come back in the same order, with the id of anything created. ' +
				'It stops at the first change that fails and keeps the ones before it. A change can only use ids that exist before the call, ' +
				'so to change something created here, use the ids it returns in a second call.',
			inputSchema: {changes: z.array(changeInput).min(1).max(batchLimit)},
		},
		async ({changes}) => {
			const {results} = await client.batch(changes.map(requestFor));
			const shown = await Promise.all(results.map(async ({status, body}: {status: number; body: any}, index) => {
				const change = changes[index]!;
				// As update_thread does, a note edit that did not fit shows the
				// notes as they are for the next try.
				if (status === 400 && change.tool === 'update_thread') return {error: body.error, notes: (await client.thread(change.thread ?? threadId)).notes};
				if (status !== 200) return {error: body.error};
				if (body.updated === false) return {error: editedByUser, theirVersion: withNotes(body.thread)};
				return ['create_thread', 'add_task', 'turn_task_into_thread', 'create_area', 'create_project'].includes(change.tool) ? {done: true, id: body.id} : {done: true};
			}));
			if (!('error' in shown.at(-1)!)) return text({results: shown});
			return {...text({results: shown, notTried: changes.length - shown.length}), isError: true};
		},
	);

	server.registerTool(
		'get_thoughts',
		{description: "Read the user's Thoughts, their one page of free text. Only when the user asks you to."},
		async () => ({content: [{type: 'text' as const, text: (await client.thoughts()).text}]}),
	);

	return server;
}
