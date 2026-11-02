// The Instance's Settings (CONTEXT.md): choices that change how todos looks
// everywhere it is shown, kept with the Instance so every browser, device and
// Home in the terminal follow them.

import type {Storage} from '../storage/storage.js';
import {ThreadError} from './threads.js';

// The accent colour, which tells one Instance from another at a glance.
export const accentColours = ['blue', 'teal', 'green', 'amber', 'pink', 'purple', 'red'] as const;
export type AccentColour = (typeof accentColours)[number];

export type Settings = {accentColour: AccentColour};
export type SettingsEdit = Partial<Settings>;

export class InstanceSettings {
	constructor(private readonly storage: Storage) {}

	get(): Promise<Settings> {
		return this.storage.getSettings();
	}

	async edit(edit: SettingsEdit): Promise<Settings> {
		if (edit.accentColour !== undefined && !accentColours.includes(edit.accentColour)) {
			throw new ThreadError('invalid', `The colour must be one of ${accentColours.join(', ')}`);
		}
		const changes: SettingsEdit = edit.accentColour === undefined ? {} : {accentColour: edit.accentColour};
		await this.storage.updateSettings(changes);
		return this.storage.getSettings();
	}
}
