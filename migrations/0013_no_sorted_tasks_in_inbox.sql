-- A Task that belongs to a Thread, a project or an area never sits in the
-- Inbox. Ones that do from before that rule move to Anytime. Changing only
-- data keeps this safe for the Worker already running.
UPDATE tasks SET when_kind = 'anytime' WHERE when_kind = 'inbox' AND (thread_id IS NOT NULL OR belongs_kind <> 'none');
