// Shows each due Reminder the Instance sends as a notification with the
// item's title, and opens the item when the notification is tapped, which
// counts the same as opening it from the bell.

self.addEventListener('push', event => {
	const notice = event.data?.json();
	if (!notice) return;
	// The tag means a Reminder sent again replaces its notification.
	const tag = `${notice.item.kind}:${notice.item.id}`;
	event.waitUntil(self.registration.showNotification(notice.title, {tag, data: notice.item}));
});

self.addEventListener('notificationclick', event => {
	event.notification.close();
	const item = event.notification.data;
	event.waitUntil(
		(async () => {
			const open = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
			const app = open.find(client => new URL(client.url).origin === self.location.origin);
			if (app) {
				await app.focus();
				app.postMessage({reminder: item});
			} else {
				await self.clients.openWindow(`/?reminder=${encodeURIComponent(`${item.kind}:${item.id}`)}`);
			}
		})(),
	);
});
