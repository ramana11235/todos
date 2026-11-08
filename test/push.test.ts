import {beforeEach, describe, expect, it} from 'vitest';
import {PushDevices, type Notice, type PushDevice} from '../src/core/push.js';
import {Reminders} from '../src/core/reminders.js';
import {Tasks} from '../src/core/tasks.js';
import {hostedPushKeys, WebPush} from '../src/reminders/webpush.js';
import type {Storage} from '../src/storage/storage.js';
import {makeStorage} from './support.js';

const base64url = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes as ArrayBuffer).toString('base64url');

// A key pair made the way web push wants it: the public key as its raw 65
// bytes and the private key as its 32-byte secret, both in base64url.
async function keyPair() {
	const pair = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
	const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
	const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
	return {publicKey: base64url(raw), privateKey: jwk.d!};
}

// A subscription like the one a browser gives, at a made-up push service.
async function device(name: string): Promise<PushDevice> {
	const {publicKey} = await keyPair();
	return {endpoint: `https://push.example.com/${name}`, keys: {p256dh: publicKey, auth: base64url(crypto.getRandomValues(new Uint8Array(16)))}};
}

let storage: Storage;
let keys: {kind: 'set'; publicKey: string; privateKey: string};

beforeEach(async () => {
	storage = await makeStorage();
	keys = {kind: 'set', ...(await keyPair())};
});

describe('devices that get notifications', () => {
	it('are kept once each, with the keys a browser gave last', async () => {
		const devices = new PushDevices(storage, keys);
		const phone = await device('phone');
		await devices.add(phone);
		await devices.add({...phone, keys: {...phone.keys, auth: 'newer'}});
		expect(await storage.listPushDevices()).toEqual([{...phone, keys: {...phone.keys, auth: 'newer'}}]);
	});

	it('are refused unless they are an https push subscription', async () => {
		const devices = new PushDevices(storage, keys);
		await expect(devices.add({endpoint: 'http://push.example.com/a', keys: {p256dh: 'x', auth: 'y'}})).rejects.toThrow('push subscription');
		await expect(devices.add({endpoint: 'https://push.example.com/a'})).rejects.toThrow('push subscription');
	});

	it('are refused by an Instance with no push keys, which gives no public key', async () => {
		const devices = new PushDevices(storage, {kind: 'none'});
		expect(devices.publicKey()).toEqual({kind: 'none'});
		await expect(devices.add(await device('phone'))).rejects.toThrow('no push keys');
	});

	it('learn only the public key', () => {
		expect(new PushDevices(storage, keys).publicKey()).toEqual({kind: 'set', publicKey: keys.publicKey});
	});
});

describe('a Reminder that comes due', () => {
	it('is sent once, with its item and title, after it is saved as due', async () => {
		const sent: Notice[] = [];
		let time = new Date('2026-11-08T08:00:00Z');
		const reminders = new Reminders(storage, () => time, {notify: async notice => void sent.push(notice)});
		const task = await new Tasks(storage, () => time).add({title: 'Call the dentist', reminder: {kind: 'set', at: '2026-11-08T09:00:00Z'}});
		await reminders.came({kind: 'task', id: task.id});
		expect(sent).toEqual([]);
		time = new Date('2026-11-08T09:00:00Z');
		await reminders.came({kind: 'task', id: task.id});
		await reminders.came({kind: 'task', id: task.id});
		expect(sent).toEqual([{item: {kind: 'task', id: task.id}, title: 'Call the dentist'}]);
		expect((await storage.getTask(task.id))!.reminder.kind).toBe('due');
	});

	it('whose moment passed while a local API was stopped is sent when it starts', async () => {
		const sent: Notice[] = [];
		const task = await new Tasks(storage, () => new Date('2026-11-08T08:00:00Z')).add({title: 'Water the plants', reminder: {kind: 'set', at: '2026-11-08T09:00:00Z'}});
		const reminders = new Reminders(storage, () => new Date('2026-11-08T10:00:00Z'), {notify: async notice => void sent.push(notice)});
		await reminders.wakeAll({set: async () => {}, clear: async () => {}});
		expect(sent).toEqual([{item: {kind: 'task', id: task.id}, title: 'Water the plants'}]);
	});
});

describe('web push', () => {
	const notice: Notice = {item: {kind: 'task', id: 't1'}, title: 'Call the dentist'};

	it('sends an encrypted, signed notification to every device', async () => {
		const phone = await device('phone');
		const laptop = await device('laptop');
		await storage.addPushDevice(phone);
		await storage.addPushDevice(laptop);
		const posts: {url: string; init: RequestInit}[] = [];
		await new WebPush(storage, keys, async (url, init) => {
			posts.push({url: String(url), init: init!});
			return new Response(null, {status: 201});
		}).notify(notice);
		expect(posts.map(post => post.url).sort()).toEqual([laptop.endpoint, phone.endpoint]);
		for (const {init} of posts) {
			const headers = init.headers as Record<string, string>;
			expect(init.method!.toUpperCase()).toBe('POST');
			expect(headers['content-encoding']).toBe('aes128gcm');
			expect(headers.authorization).toMatch(new RegExp(`^vapid t=.+, k=${keys.publicKey}$`));
			expect(headers.urgency).toBe('high');
			// Encrypted, so the title is nowhere in what the push service sees.
			expect(Buffer.from(init.body as Uint8Array).includes('Call the dentist')).toBe(false);
		}
	});

	it('forgets a device that took back its permission, and still sends to the rest', async () => {
		const gone = await device('gone');
		const failing = await device('failing');
		const phone = await device('phone');
		for (const one of [gone, failing, phone]) await storage.addPushDevice(one);
		const reached: string[] = [];
		await new WebPush(storage, keys, async url => {
			if (String(url) === gone.endpoint) return new Response(null, {status: 410});
			if (String(url) === failing.endpoint) throw new Error('offline');
			reached.push(String(url));
			return new Response(null, {status: 201});
		}).notify(notice);
		expect(reached).toEqual([phone.endpoint]);
		expect((await storage.listPushDevices()).map(one => one.endpoint)).toEqual([failing.endpoint, phone.endpoint]);
	});

	it("uses the hosted Instance's keys only when both secrets are set", () => {
		expect(hostedPushKeys({})).toEqual({kind: 'none'});
		expect(hostedPushKeys({VAPID_PUBLIC_KEY: 'public'})).toEqual({kind: 'none'});
		expect(hostedPushKeys({VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private'})).toEqual({kind: 'set', publicKey: 'public', privateKey: 'private'});
	});
});
