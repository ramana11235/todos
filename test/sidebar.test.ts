import {describe, expect, it} from 'vitest';
import type {Area, Project} from '../src/core/project.js';
import {areaDropped, projectsDropped, sidebarRows} from '../web/src/sidebar.js';

const area = (id: string, position: number): Area => ({id, title: id, notes: '', ended: 'not_ended', position, createdAt: ''});
const project = (id: string, position: number, inArea?: string): Project => ({
	id, title: id, notes: '', area: inArea ? {kind: 'in', id: inArea} : {kind: 'none'}, deadline: {kind: 'none'}, ended: 'not_ended', position, createdAt: '',
});

// Loose, then Health with Run and Sleep, then Home, which has no projects yet.
const areas = [area('Health', 0), area('Home', 1)];
const projects = [project('Loose', 0), project('Run', 1, 'Health'), project('Sleep', 2, 'Health'), {...project('Old', 3), ended: 'done' as const}];
const rows = sidebarRows(projects, areas);

describe('dragging in the sidebar', () => {
	it('lists projects in no area, then each area with its open projects', () => {
		expect(rows.map(row => row.id)).toEqual(['Loose', 'Health', 'Run', 'Sleep', 'Home']);
	});

	it('puts a project dragged down onto an area at the top of that area', () => {
		expect(projectsDropped(rows, projects, ['Loose'], 'Loose', {kind: 'area', id: 'Home'})).toEqual([
			{id: 'Run', area: {kind: 'in', id: 'Health'}, position: 0},
			{id: 'Sleep', area: {kind: 'in', id: 'Health'}, position: 1},
			{id: 'Loose', area: {kind: 'in', id: 'Home'}, position: 2},
		]);
	});

	it('takes a project out of its area when dragged up above the first area', () => {
		expect(projectsDropped(rows, projects, ['Sleep'], 'Sleep', {kind: 'area', id: 'Health'})).toEqual([
			{id: 'Sleep', area: {kind: 'none'}, position: 1},
			{id: 'Run', area: {kind: 'in', id: 'Health'}, position: 2},
		]);
	});

	it('reorders within an area, and moves several together in the order they had', () => {
		expect(projectsDropped(rows, projects, ['Run'], 'Run', {kind: 'project', id: 'Sleep'})).toEqual([
			{id: 'Sleep', area: {kind: 'in', id: 'Health'}, position: 1},
			{id: 'Run', area: {kind: 'in', id: 'Health'}, position: 2},
		]);
		expect(projectsDropped(rows, projects, ['Sleep', 'Loose'], 'Sleep', {kind: 'area', id: 'Home'})).toEqual([
			{id: 'Run', area: {kind: 'in', id: 'Health'}, position: 0},
			{id: 'Loose', area: {kind: 'in', id: 'Home'}, position: 1},
			{id: 'Sleep', area: {kind: 'in', id: 'Home'}, position: 2},
		]);
		expect(projectsDropped(rows, projects, ['Run'], 'Run', {kind: 'project', id: 'Run'})).toEqual([]);
	});

	it('moves an area into the place of the one it is dropped on', () => {
		expect(areaDropped(areas, 'Home', 'Health')).toEqual([{id: 'Home', position: 0}, {id: 'Health', position: 1}]);
		expect(areaDropped(areas, 'Home', 'Home')).toEqual([]);
	});
});
