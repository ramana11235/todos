-- Each device I allowed to show notifications, by the address its
-- browser's push service gave it, with the keys a notification for it is
-- encrypted with. A new table, so the Worker already running ignores it.
CREATE TABLE push_devices (
	endpoint TEXT PRIMARY KEY,
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	created_at TEXT NOT NULL
);
