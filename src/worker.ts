// The hosted Instance's entry point. Cloudflare serves the web app's files
// itself and sends only /api requests here.

import {requireAccess} from './api/access.js';
import {createHandler} from './api/api.js';
import {Projects} from './core/projects.js';
import {InstanceSettings} from './core/settings.js';
import {Tasks} from './core/tasks.js';
import {Thoughts} from './core/thoughts.js';
import {Threads} from './core/threads.js';
import {DurableObjectClock, type DurableObjectNamespace} from './reminders/alarm.js';
import {D1Storage, type D1Database} from './storage/d1.js';

// Cloudflare finds each item's Reminder alarm by this export's name.
export {ReminderAlarm} from './reminders/alarm.js';

type Env = {DB: D1Database; REMINDERS: DurableObjectNamespace; ACCESS_TEAM: string; ACCESS_AUD: string};

let handler: ReturnType<typeof requireAccess> | undefined;

export default {
	fetch(request: Request, env: Env): Promise<Response> {
		// Made once per Worker instance, so the keys Access signs with are
		// fetched once rather than on every request.
		if (!handler) {
			const storage = new D1Storage(env.DB);
			const api = createHandler(new Threads(storage), new Tasks(storage, undefined, new DurableObjectClock(env.REMINDERS)), new Thoughts(storage), new Projects(storage), new InstanceSettings(storage));
			handler = requireAccess(api, {team: env.ACCESS_TEAM, audience: env.ACCESS_AUD});
		}
		return handler(request);
	},
};
