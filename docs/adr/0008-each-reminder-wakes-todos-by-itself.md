# Each Reminder wakes todos by itself

A Reminder must reach me at its moment, but the hosted API only runs when a request comes in, and a local one only while its process runs. So the core sets and clears a ReminderClock, a port with one moment per item, and each Instance has its own adapter. On the hosted Instance each item with a Reminder has its own Durable Object, named by the item, whose alarm goes off at the Reminder's moment. A local Instance keeps one timer per item in its API process, sets them all again when it starts, and makes due at once any whose moment passed while it was not running. Tests use a clock they move forward.

## Considered options

- A Cron Trigger every minute that makes due whatever has come. Rejected because it can be up to a minute late and runs while nothing is due, and because checking the clock every minute is not what a Reminder means, which is "at this time, tell me".
- One Durable Object holding every Reminder, with its single alarm set for the earliest. Rejected because every change to any Reminder would have to work out the earliest again, while one alarm per item matches one Reminder per item, and setting or clearing one touches no other.

## Consequences

- The hosted Instance uses Durable Objects, SQLite-backed as the free plan requires. An alarm waiting costs nothing; setting one is a row written and its going off a request.
- A local Instance makes a Reminder due only while the laptop is awake, and one missed while it slept comes when it wakes.
- A Reminder whose moment has already passed when it is set is due at once, so nothing waits on a clock for it.
