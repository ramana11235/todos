// The Notifier for an Instance with push keys: each notice goes to every
// allowed device through its browser's push service, encrypted and signed as
// web push requires (RFC 8291 and RFC 8292).

import {buildPushPayload} from '@block65/webcrypto-web-push';
import {notifierThatSendsNothing, type Notice, type Notifier, type PushKeys} from '../core/push.js';
import type {Storage} from '../storage/storage.js';

// Push services ask for a way to reach whoever sends, and todos' own page is
// the one every Instance shares.
const subject = 'https://github.com/ramana11235/todos';

// A Reminder that cannot be delivered within a day is no use when it lands.
const dayInSeconds = 24 * 60 * 60;

export class WebPush implements Notifier {
	constructor(
		private readonly storage: Storage,
		private readonly keys: Extract<PushKeys, {kind: 'set'}>,
		// Called through a function of its own, because Workers refuse fetch
		// called as a method of anything but the global object.
		private readonly send: typeof fetch = (url, init) => fetch(url, init),
	) {}

	// One device failing does not stop the rest. A push service answers 404
	// or 410 once a device has taken back its permission, so it is forgotten.
	async notify(notice: Notice): Promise<void> {
		const devices = await this.storage.listPushDevices();
		const sent = await Promise.allSettled(
			devices.map(async device => {
				const payload = await buildPushPayload(
					{data: notice, options: {ttl: dayInSeconds, urgency: 'high'}},
					{...device, expirationTime: null},
					{subject, publicKey: this.keys.publicKey, privateKey: this.keys.privateKey},
				);
				const response = await this.send(device.endpoint, payload);
				if (response.status === 404 || response.status === 410) await this.storage.removePushDevice(device.endpoint);
				else if (!response.ok) throw new Error(`The push service answered ${response.status}`);
			}),
		);
		for (const one of sent) if (one.status === 'rejected') console.error('A Reminder could not be sent to a device:', one.reason);
	}
}

// Web push when the Instance has keys, and nothing sent otherwise.
export const notifierFor = (storage: Storage, keys: PushKeys): Notifier => (keys.kind === 'set' ? new WebPush(storage, keys) : notifierThatSendsNothing);

// The hosted Instance's key pair, kept as the Worker secrets VAPID_PUBLIC_KEY
// and VAPID_PRIVATE_KEY. With either missing it sends nothing.
export type PushSecrets = {VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string};
export const hostedPushKeys = (env: PushSecrets): PushKeys =>
	env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? {kind: 'set', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY} : {kind: 'none'};
