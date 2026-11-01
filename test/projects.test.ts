import {beforeEach, describe, expect, it} from 'vitest';
import {Projects} from '../src/core/projects.js';
import {homeRows, taskBelongs, threadBelongs} from '../src/core/project.js';
import {Tasks} from '../src/core/tasks.js';
import {Threads} from '../src/core/threads.js';
import type {Storage} from '../src/storage/storage.js';
import {makeStorage, startApi} from './support.js';

let storage: Storage;
let projects: Projects;
let threads: Threads;
let tasks: Tasks;

beforeEach(async () => {
	storage = await makeStorage();
	projects = new Projects(storage);
	threads = new Threads(storage);
	tasks = new Tasks(storage);
});

describe('projects and areas', () => {
	it('refuse a new Thread they cannot hold without making it', async () => {
		const todos = await projects.createProject({title: 'Build todos'});
		const parent = await threads.create({title: 'Plan'});
		await expect(threads.create({title: 'Child', parentId: parent.id, belongs: {kind: 'project', id: todos.id}})).rejects.toThrow('top of its tree');
		await expect(threads.create({title: 'Lost', belongs: {kind: 'project', id: 'no-such-project'}})).rejects.toThrow('No project');
		await expect(threads.create({title: 'Bad day', when: {kind: 'on_day', day: 'soon'}})).rejects.toThrow();
		expect((await threads.list()).map(thread => thread.title)).toEqual(['Plan']);
	});

	it('take a position, so the sidebar keeps the order they were dragged into', async () => {
		const health = await projects.createArea({title: 'Health'});
		const run = await projects.createProject({title: 'Run a 10k'});
		expect(await projects.editProject(run.id, {position: 2.5, area: {kind: 'in', id: health.id}})).toMatchObject({position: 2.5, area: {kind: 'in', id: health.id}});
		expect(await projects.editArea(health.id, {position: -1})).toMatchObject({position: -1});
		await expect(projects.editProject(run.id, {position: 'top' as never})).rejects.toThrow('position');
	});

	it('reorder a top-level Thread among those in the same project or area, as Home groups them', async () => {
		const health = await projects.createArea({title: 'Health'});
		const a = await threads.create({title: 'A', belongs: {kind: 'area', id: health.id}});
		await threads.create({title: 'B'});
		await threads.create({title: 'C', belongs: {kind: 'area', id: health.id}});
		await threads.reorder(a.id, 'down');
		expect((await threads.list()).sort((x, y) => x.position - y.position).map(thread => thread.title)).toEqual(['C', 'B', 'A']);
	});

	it('show on Home as parents of the Threads in them, projects first, and only when a Thread shows there', async () => {
		const health = await projects.createArea({title: 'Health'});
		const run = await projects.createProject({title: 'Run a 10k', area: {kind: 'in', id: health.id}});
		const todos = await projects.createProject({title: 'Build todos'});
		await projects.createProject({title: 'Plan a kitchen refit'});
		await threads.create({title: 'Loose'});
		const plan = await threads.create({title: 'Plan', belongs: {kind: 'project', id: todos.id}});
		await threads.create({title: 'Child', parentId: plan.id});
		await threads.create({title: 'Train', belongs: {kind: 'project', id: run.id}});
		await threads.create({title: 'Sleep', belongs: {kind: 'area', id: health.id}});
		const parked = await threads.create({title: 'Parked', belongs: {kind: 'area', id: (await projects.createArea({title: 'Later'})).id}});
		await threads.edit(parked.id, {when: {kind: 'someday'}});
		const all = await threads.list();
		const [p, a] = [await projects.listProjects(), await projects.listAreas()];
		const drawn = (folded = new Set<string>()) =>
			homeRows(all, p, a, {view: 'active', today: '2026-10-17', folded}).map(row => `${'  '.repeat(row.depth)}${row.title}${row.folded ? ` (${row.folded.hidden} hidden${row.folded.onMeBelow ? ', on me' : ''})` : ''}`);
		expect(drawn()).toEqual(['Build todos', '  Plan', '    Child', 'Health', '  Run a 10k', '    Train', '  Sleep', 'Loose']);
		expect(drawn(new Set([health.id]))).toEqual(['Build todos', '  Plan', '    Child', 'Health (3 hidden, on me)', 'Loose']);
		expect(homeRows(all, p, a, {view: 'bring_in', today: '2026-10-17'}).map(row => row.title)).toContain('Later');
		expect(homeRows(all, [], [], {view: 'active', today: '2026-10-17'}).map(row => row.title)).toEqual(['Loose', 'Plan', 'Child', 'Train', 'Sleep']);
	});

	it('keep their fields, with no nulls, and an area is never Done', async () => {
		const health = await projects.createArea({title: ' Health '});
		const run = await projects.createProject({title: 'Run a 10k', area: {kind: 'in', id: health.id}, deadline: {kind: 'by_day', day: '2026-12-01'}});
		const todos = await projects.createProject({title: 'Build todos'});
		expect(await projects.listAreas()).toEqual([{id: health.id, title: 'Health', notes: '', ended: 'not_ended', position: 0, createdAt: expect.any(String)}]);
		expect(await projects.getProject(run.id)).toMatchObject({area: {kind: 'in', id: health.id}, deadline: {kind: 'by_day', day: '2026-12-01'}, ended: 'not_ended', position: 0});
		expect(await projects.getProject(todos.id)).toMatchObject({area: {kind: 'none'}, deadline: {kind: 'none'}, position: 1});

		await expect(projects.editArea(health.id, {ended: 'done' as never})).rejects.toThrow('never Done');
		await projects.editArea(health.id, {ended: 'dropped'});
		await projects.editProject(run.id, {ended: 'done', area: {kind: 'none'}, deadline: {kind: 'none'}});
		expect(await projects.getProject(run.id)).toMatchObject({ended: 'done', area: {kind: 'none'}, deadline: {kind: 'none'}});
		await projects.editProject(run.id, {ended: 'not_ended'});
		expect((await projects.getArea(health.id)).ended).toBe('dropped');
	});

	it('refuse an area that does not exist and a missing title', async () => {
		await expect(projects.createProject({title: 'Build todos', area: {kind: 'in', id: 'gone'}})).rejects.toMatchObject({code: 'not_found'});
		await expect(projects.createArea({title: '  '})).rejects.toMatchObject({code: 'invalid'});
	});
});

describe('what a Thread belongs to', () => {
	it('is set only at the top of its tree, and the Threads under it belong where it does', async () => {
		const todos = await projects.createProject({title: 'Build todos'});
		const top = await threads.create({title: 'Decide the model', belongs: {kind: 'project', id: todos.id}});
		const child = await threads.create({title: 'Write the issues', parentId: top.id});
		expect(top.belongs).toEqual({kind: 'project', id: todos.id});
		expect(threadBelongs(child, await threads.list())).toEqual({kind: 'project', id: todos.id});
		await expect(threads.edit(child.id, {belongs: {kind: 'project', id: todos.id}})).rejects.toThrow('top of its tree');
		await expect(threads.create({title: 'Under', parentId: top.id, belongs: {kind: 'project', id: todos.id}})).rejects.toThrow('top of its tree');
		await expect(threads.edit(top.id, {belongs: {kind: 'area', id: 'gone'}})).rejects.toMatchObject({code: 'not_found'});
	});

	it('follows the tree a Thread moves into, and is kept when it moves to the top level', async () => {
		const todos = await projects.createProject({title: 'Build todos'});
		const health = await projects.createArea({title: 'Health'});
		const top = await threads.create({title: 'Decide the model', belongs: {kind: 'project', id: todos.id}});
		const child = await threads.create({title: 'Write the issues', parentId: top.id});
		expect((await threads.move(child.id, null)).belongs).toEqual({kind: 'project', id: todos.id});
		expect((await threads.get(child.id)).belongs).toEqual({kind: 'project', id: todos.id});

		const gym = await threads.create({title: 'Find a gym', belongs: {kind: 'area', id: health.id}});
		await threads.move(gym.id, top.id);
		expect((await threads.get(gym.id)).belongs).toEqual({kind: 'none'});
		expect(threadBelongs(await threads.get(gym.id), await threads.list())).toEqual({kind: 'project', id: todos.id});
	});

	it('can be set by a Session for its own Thread', async () => {
		const health = await projects.createArea({title: 'Health'});
		const mine = await threads.create({title: 'Find a gym'});
		await threads.sessionUpdate(mine.id, {belongs: {kind: 'area', id: health.id}});
		expect((await threads.get(mine.id)).belongs).toEqual({kind: 'area', id: health.id});
	});
});

describe('what a Task belongs to', () => {
	it('is one Thread, project or area at most, and linking one takes it out of the other', async () => {
		const health = await projects.createArea({title: 'Health'});
		const gym = await threads.create({title: 'Find a gym'});
		await expect(tasks.add({title: 'Book a class', threadId: gym.id, belongs: {kind: 'area', id: health.id}})).rejects.toThrow('at most');
		const task = await tasks.add({title: 'Book a class', belongs: {kind: 'area', id: health.id}});
		expect(task).toMatchObject({threadId: null, belongs: {kind: 'area', id: health.id}});
		expect(await tasks.edit(task.id, {threadId: gym.id})).toMatchObject({threadId: gym.id, belongs: {kind: 'none'}});
		expect(await tasks.edit(task.id, {belongs: {kind: 'area', id: health.id}})).toMatchObject({threadId: null, belongs: {kind: 'area', id: health.id}});
		await expect(tasks.edit(task.id, {threadId: gym.id, belongs: {kind: 'area', id: health.id}})).rejects.toThrow('at most');
		const after = await tasks.add({title: 'Buy trainers', after: task.id});
		expect(after.belongs).toEqual({kind: 'area', id: health.id});
	});

	it('is its Thread\'s when it is on one, and passes to a top-level Thread it is turned into', async () => {
		const health = await projects.createArea({title: 'Health'});
		const gym = await threads.create({title: 'Find a gym', belongs: {kind: 'area', id: health.id}});
		const onThread = await tasks.add({title: 'Book a class', threadId: gym.id});
		expect(taskBelongs(onThread, await threads.list())).toEqual({kind: 'area', id: health.id});
		const loose = await tasks.add({title: 'Plan meals', belongs: {kind: 'area', id: health.id}});
		expect((await tasks.turnIntoThread(loose.id, null, threads)).belongs).toEqual({kind: 'area', id: health.id});
		const under = await tasks.add({title: 'Try yoga', belongs: {kind: 'area', id: health.id}});
		expect((await tasks.turnIntoThread(under.id, gym.id, threads)).belongs).toEqual({kind: 'none'});
	});
});

describe('projects and areas through the API', () => {
	it('are created, changed and listed, and a change to one is noticed by a poll', async () => {
		const api = await startApi();
		try {
			const {client} = api;
			const first = await client.changes({kind: 'nothing'});
			if (first.kind !== 'changed') throw new Error('A client that has seen nothing gets everything');
			const seen = {kind: 'number' as const, number: first.number};
			const health = await client.createArea({title: 'Health'});
			const later = await client.changes(seen);
			expect(later).toMatchObject({kind: 'changed', areas: [{title: 'Health'}], projects: []});
			if (later.kind !== 'changed') return;
			const run = await client.createProject({title: 'Run a 10k', area: {kind: 'in', id: health.id}});
			expect(await client.changes({kind: 'number', number: later.number})).toMatchObject({kind: 'changed', projects: [{title: 'Run a 10k'}]});
			await client.editProject(run.id, {ended: 'done'});
			await client.editArea(health.id, {title: 'Health and fitness'});
			expect(await client.projects()).toMatchObject([{ended: 'done'}]);
			expect(await client.areas()).toMatchObject([{title: 'Health and fitness'}]);
			const thread = await client.create('Find a gym', null, null, {belongs: {kind: 'project', id: run.id}});
			expect(thread.belongs).toEqual({kind: 'project', id: run.id});
			await expect(client.editArea('gone', {title: 'x'})).rejects.toMatchObject({status: 404});
		} finally {
			await api.stop();
		}
	});
});
