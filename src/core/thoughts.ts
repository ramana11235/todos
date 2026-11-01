// Thoughts is one page of free text that only I write (CONTEXT.md). Each
// save says which version of the page it was written over, so an older copy
// can never overwrite a newer one.

import type {Storage} from '../storage/storage.js';
import {ThreadError} from './threads.js';

export type Page = {text: string; version: number};

export type SaveResult = {saved: true; version: number} | {saved: false; page: Page};

export class Thoughts {
	constructor(private readonly storage: Storage) {}

	get(): Promise<Page> {
		return this.storage.getThoughts();
	}

	async save(text: string, version: number): Promise<SaveResult> {
		if (typeof text !== 'string' || !Number.isInteger(version)) {
			throw new ThreadError('invalid', 'Saving Thoughts needs the text and the version it was written over');
		}
		if (await this.storage.saveThoughts(text, version)) return {saved: true, version: version + 1};
		return {saved: false, page: await this.storage.getThoughts()};
	}
}
