-- A Checklist is always read and written whole, so it is kept as JSON.
ALTER TABLE tasks ADD COLUMN deadline TEXT;
ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN checklist TEXT NOT NULL DEFAULT '[]';
