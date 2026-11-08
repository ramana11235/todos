-- A Thread and a project can have a Reminder, as a Task can: none, set
-- for a moment, or due once that moment came, with the moment in
-- reminder_at. Existing ones have none. The columns have defaults, so the
-- Worker already running ignores them.
ALTER TABLE threads ADD COLUMN reminder_kind TEXT NOT NULL DEFAULT 'none';
ALTER TABLE threads ADD COLUMN reminder_at TEXT;
ALTER TABLE projects ADD COLUMN reminder_kind TEXT NOT NULL DEFAULT 'none';
ALTER TABLE projects ADD COLUMN reminder_at TEXT;
