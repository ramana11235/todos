-- Projects and areas stand beside Threads (docs/adr/0006). A Thread at the
-- top of its tree, and a Task with no Thread, can belong to one of them;
-- belongs_kind is none, project or area, and belongs_id is empty for none.
-- A project's empty area_id or deadline means it has none. Changes to them
-- bump the change number, as Threads and Tasks do.
CREATE TABLE areas (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', ended TEXT NOT NULL DEFAULT 'not_ended', position REAL NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', area_id TEXT, deadline TEXT, ended TEXT NOT NULL DEFAULT 'not_ended', position REAL NOT NULL, created_at TEXT NOT NULL);
ALTER TABLE threads ADD COLUMN belongs_kind TEXT NOT NULL DEFAULT 'none';
ALTER TABLE threads ADD COLUMN belongs_id TEXT;
ALTER TABLE tasks ADD COLUMN belongs_kind TEXT NOT NULL DEFAULT 'none';
ALTER TABLE tasks ADD COLUMN belongs_id TEXT;
CREATE TRIGGER area_added AFTER INSERT ON areas BEGIN UPDATE changes SET number = number + 1; END;
CREATE TRIGGER area_changed AFTER UPDATE ON areas BEGIN UPDATE changes SET number = number + 1; END;
CREATE TRIGGER project_added AFTER INSERT ON projects BEGIN UPDATE changes SET number = number + 1; END;
CREATE TRIGGER project_changed AFTER UPDATE ON projects BEGIN UPDATE changes SET number = number + 1; END;
