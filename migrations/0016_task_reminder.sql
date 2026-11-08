-- A Task can have a Reminder: none, set for a moment, or due once that
-- moment came, with the moment in reminder_at as an instant. Existing Tasks
-- have none. The columns have defaults, so the Worker already running
-- ignores them.
ALTER TABLE tasks ADD COLUMN reminder_kind TEXT NOT NULL DEFAULT 'none';
ALTER TABLE tasks ADD COLUMN reminder_at TEXT;
