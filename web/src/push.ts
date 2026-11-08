// Notifications on this device for Reminders that come due. The service
// worker in public/sw.js shows them; this file asks for permission and tells
// the Instance where to send them.

import type {Client} from '../../src/client/client';
import type {ReminderItem} from '../../src/core/reminder';

// Whether this device can be asked. A browser without web push, such as
// Safari in a tab on an iPhone rather than from the home screen, cannot, and
// nor can any device of an Instance with no push keys.
export type PushAsk = 'cannot' | 'ask' | 'allowed' | 'refused';

let client: Client | undefined;
let publicKey: string | undefined;

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function pushAsk(): PushAsk {
	if (!supported() || publicKey === undefined) return 'cannot';
	if (Notification.permission === 'granted') return 'allowed';
	return Notification.permission === 'denied' ? 'refused' : 'ask';
}

// Starts the service worker and learns the Instance's public key. A device
// that already said yes sends its subscription again, since a browser can
// change it.
export async function startPush(api: Client): Promise<void> {
	if (!supported()) return;
	client = api;
	await navigator.serviceWorker.register('/sw.js');
	const key = await api.pushKey();
	if (key.kind === 'set') publicKey = key.publicKey;
	if (pushAsk() === 'allowed') await subscribe();
}

// Asks this device once. Browsers only show the question straight after a
// tap, so this is called from the tap that sets a Reminder or from Settings,
// before anything else is awaited.
export function askForPush(): Promise<PushAsk> {
	if (pushAsk() !== 'ask') return Promise.resolve(pushAsk());
	return Notification.requestPermission().then(async answer => {
		if (answer === 'granted') await subscribe();
		return pushAsk();
	});
}

async function subscribe(): Promise<void> {
	const registration = await navigator.serviceWorker.ready;
	const subscription =
		(await registration.pushManager.getSubscription()) ??
		(await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: bytesOf(publicKey!)}));
	await client!.addPushDevice(subscription.toJSON());
}

const bytesOf = (base64url: string) => Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// The item a tapped notification opens: from the page's address when the tap
// opened the app, or from the service worker when the app was already open.
export function notifiedItem(): ReminderItem | null {
	const given = new URLSearchParams(window.location.search).get('reminder');
	const [kind, id] = given?.split(':') ?? [];
	return kind && id && ['task', 'thread', 'project'].includes(kind) ? {kind: kind as ReminderItem['kind'], id} : null;
}

export function onNotified(open: (item: ReminderItem) => void): () => void {
	if (!('serviceWorker' in navigator)) return () => {};
	const heard = (event: MessageEvent) => event.data?.reminder && open(event.data.reminder);
	navigator.serviceWorker.addEventListener('message', heard);
	return () => navigator.serviceWorker.removeEventListener('message', heard);
}
