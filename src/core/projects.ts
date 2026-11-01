// Everything that changes projects and areas goes through here, so the rules
// in CONTEXT.md hold whichever client asks. Nothing is ever deleted: an area
// is Dropped and a project Done or Dropped.

import {randomUUID} from 'node:crypto';
import type {Storage} from '../storage/storage.js';
import type {Area, Belongs, InArea, Project} from './project.js';
import type {Deadline, Ended} from './thread.js';
import {changedFields, requireDeadline, requireEnded, ThreadError} from './threads.js';

// position is where it sits in the sidebar, as Projects and Areas hold it.
// index is its place among the areas, 0 for first, which renumbers them.
export type AreaEdit = {title?: string; notes?: string; ended?: 'not_ended' | 'dropped'; position?: number; index?: number};

export type NewProject = {title: string; notes?: string; area?: InArea; deadline?: Deadline};

// index is its place among the projects of its area, or of those in no area,
// 0 for first, which renumbers them.
export type ProjectEdit = {title?: string; notes?: string; area?: InArea; deadline?: Deadline; ended?: Ended; position?: number; index?: number};

export class Projects {
	constructor(
		private readonly storage: Storage,
		private readonly now: () => Date = () => new Date(),
	) {}

	listAreas(): Promise<Area[]> {
		return this.storage.listAreas();
	}

	listProjects(): Promise<Project[]> {
		return this.storage.listProjects();
	}

	async getArea(id: string): Promise<Area> {
		const area = (await this.storage.listAreas()).find(candidate => candidate.id === id);
		if (!area) throw new ThreadError('not_found', `No area ${id}`);
		return area;
	}

	async getProject(id: string): Promise<Project> {
		const project = (await this.storage.listProjects()).find(candidate => candidate.id === id);
		if (!project) throw new ThreadError('not_found', `No project ${id}`);
		return project;
	}

	// A new area or project goes last in the sidebar.
	async createArea({title, notes = ''}: {title: string; notes?: string}): Promise<Area> {
		const all = await this.storage.listAreas();
		const area: Area = {id: randomUUID(), title: requireTitle(title), notes: String(notes), ended: 'not_ended', position: nextPosition(all), createdAt: this.stamp()};
		await this.storage.saveArea(area);
		return area;
	}

	async editArea(id: string, edit: AreaEdit): Promise<Area> {
		const area = await this.getArea(id);
		const next = {...area};
		if (edit.title !== undefined) next.title = requireTitle(edit.title);
		if (edit.notes !== undefined) next.notes = String(edit.notes);
		if (edit.ended !== undefined) {
			if (edit.ended !== 'not_ended' && edit.ended !== 'dropped') throw new ThreadError('invalid', 'An area is never Done, as it has no outcome; its Ended is not_ended or dropped');
			next.ended = edit.ended;
		}
		if (edit.position !== undefined) next.position = requirePosition(edit.position);
		if (edit.index !== undefined) next.position = await placeAmong(await this.storage.listAreas(), next, edit.index, (other, position) => this.storage.updateArea(other, {position}));
		await this.storage.updateArea(id, changedFields(area, next));
		return next;
	}

	async createProject({title, notes = '', area = {kind: 'none'}, deadline = {kind: 'none'}}: NewProject): Promise<Project> {
		const all = await this.storage.listProjects();
		const project: Project = {
			id: randomUUID(),
			title: requireTitle(title),
			notes: String(notes),
			area: await this.requireInArea(area),
			deadline: requireDeadline(deadline),
			ended: 'not_ended',
			position: nextPosition(all),
			createdAt: this.stamp(),
		};
		await this.storage.saveProject(project);
		return project;
	}

	async editProject(id: string, edit: ProjectEdit): Promise<Project> {
		const project = await this.getProject(id);
		const next = {...project};
		if (edit.title !== undefined) next.title = requireTitle(edit.title);
		if (edit.notes !== undefined) next.notes = String(edit.notes);
		if (edit.area !== undefined) next.area = await this.requireInArea(edit.area);
		if (edit.deadline !== undefined) next.deadline = requireDeadline(edit.deadline);
		if (edit.ended !== undefined) next.ended = requireEnded(edit.ended);
		if (edit.position !== undefined) next.position = requirePosition(edit.position);
		if (edit.index !== undefined) {
			const inSameArea = (await this.storage.listProjects()).filter(other => (other.area.kind === 'in' ? other.area.id : null) === (next.area.kind === 'in' ? next.area.id : null));
			next.position = await placeAmong(inSameArea, next, edit.index, (other, position) => this.storage.updateProject(other, {position}));
		}
		await this.storage.updateProject(id, changedFields(project, next));
		return next;
	}

	private async requireInArea(value: unknown): Promise<InArea> {
		const area = value as {kind?: unknown; id?: unknown} | null;
		if (area?.kind === 'none') return {kind: 'none'};
		if (area?.kind === 'in' && typeof area.id === 'string') return {kind: 'in', id: (await this.getArea(area.id)).id};
		throw new ThreadError('invalid', 'A project\'s area is {kind: "none"} or {kind: "in", id}');
	}

	private stamp(): string {
		return this.now().toISOString();
	}
}

// What a Thread or Task is put in, checked, since it comes from outside.
// Threads and Tasks use it too, so it takes the storage rather than living on
// the class.
export async function requireBelongs(storage: Storage, value: unknown): Promise<Belongs> {
	const belongs = value as {kind?: unknown; id?: unknown} | null;
	const known = async (list: {id: string}[], id: unknown, name: string) => {
		if (!list.some(one => one.id === id)) throw new ThreadError('not_found', `No ${name} ${String(id)}`);
		return id as string;
	};
	if (belongs?.kind === 'none') return {kind: 'none'};
	if (belongs?.kind === 'project') return {kind: 'project', id: await known(await storage.listProjects(), belongs.id, 'project')};
	if (belongs?.kind === 'area') return {kind: 'area', id: await known(await storage.listAreas(), belongs.id, 'area')};
	throw new ThreadError('invalid', 'What it belongs to is {kind: "none"}, {kind: "project", id} or {kind: "area", id}');
}

// Puts `moved` at `index` among `siblings`, 0 for first, as a Thread is moved
// among its siblings: they are numbered from 0 in their new order, and only
// those whose position changes are written. Returns the position of `moved`,
// which the caller writes with its other changes.
async function placeAmong<T extends {id: string; position: number}>(siblings: T[], moved: T, index: unknown, write: (id: string, position: number) => Promise<void>): Promise<number> {
	if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) throw new ThreadError('invalid', 'A place is a whole number from 0');
	const order = siblings.filter(sibling => sibling.id !== moved.id).sort((a, b) => a.position - b.position);
	order.splice(Math.min(index, order.length), 0, moved);
	for (const [position, sibling] of order.entries()) if (sibling !== moved && sibling.position !== position) await write(sibling.id, position);
	return order.indexOf(moved);
}

const nextPosition = (all: {position: number}[]) => (all.length === 0 ? 0 : Math.max(...all.map(one => one.position)) + 1);

function requirePosition(position: unknown): number {
	if (typeof position !== 'number' || !Number.isFinite(position)) throw new ThreadError('invalid', 'A position must be a number');
	return position;
}

function requireTitle(title: unknown): string {
	const trimmed = typeof title === 'string' ? title.trim() : '';
	if (!trimmed) throw new ThreadError('invalid', 'It needs a title');
	return trimmed;
}
