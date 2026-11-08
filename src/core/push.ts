// Push notifications for Reminders that come due. Nothing here touches
// storage or the network.

import type {ReminderItem} from './reminder.js';
import {ThreadError} from './threads.js';

// A device I allowed to show notifications: the address its browser's push
// service gave it, and the keys a notification for it is encrypted with.
export type PushDevice = {endpoint: string; keys: {p256dh: string; auth: string}};

// What a notification says: the item, so tapping it opens that item, and
// its title, which is all it shows.
export type Notice = {item: ReminderItem; title: string};

// Sends a notice to every allowed device. The Instance uses web push, and
// one with no keys sends nothing.
export interface Notifier {
	notify(notice: Notice): Promise<void>;
}

export const notifierThatSendsNothing: Notifier = {notify: async () => {}};

// The key pair the Instance signs its notifications with, so a push service
// only accepts them from it. Without one it sends none.
export type PushKeys = {kind: 'none'} | {kind: 'set'; publicKey: string; privateKey: string};

// A browser gives its subscription as {endpoint, keys: {p256dh, auth}}, and
// push services only take https.
export function requirePushDevice(value: unknown): PushDevice {
	const given = value as {endpoint?: unknown; keys?: {p256dh?: unknown; auth?: unknown}} | null;
	const text = (part: unknown) => typeof part === 'string' && part !== '';
	if (text(given?.endpoint) && (given!.endpoint as string).startsWith('https://') && text(given?.keys?.p256dh) && text(given?.keys?.auth)) {
		return {endpoint: given!.endpoint as string, keys: {p256dh: given!.keys!.p256dh as string, auth: given!.keys!.auth as string}};
	}
	throw new ThreadError('invalid', 'A device is a push subscription: {endpoint: "https://…", keys: {p256dh, auth}}');
}

// The devices that get notifications, and the public key a browser needs to
// subscribe one. The private key never leaves the Instance.
export class PushDevices {
	constructor(
		private readonly storage: {addPushDevice(device: PushDevice): Promise<void>},
		private readonly keys: PushKeys,
	) {}

	publicKey(): {kind: 'none'} | {kind: 'set'; publicKey: string} {
		return this.keys.kind === 'set' ? {kind: 'set', publicKey: this.keys.publicKey} : {kind: 'none'};
	}

	async add(value: unknown): Promise<PushDevice> {
		if (this.keys.kind === 'none') throw new ThreadError('invalid', 'This Instance has no push keys, so it sends no notifications');
		const device = requirePushDevice(value);
		await this.storage.addPushDevice(device);
		return device;
	}
}
