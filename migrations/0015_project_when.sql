-- A project has a When, as a Thread does: active, someday, or on_day with
-- the day it comes back in when_day. Existing projects are Active. The
-- columns have defaults, so the Worker already running ignores them.
ALTER TABLE projects ADD COLUMN when_kind TEXT NOT NULL DEFAULT 'active';
ALTER TABLE projects ADD COLUMN when_day TEXT;
