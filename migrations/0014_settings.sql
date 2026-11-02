-- The Instance's Settings are one row that is always there. A new setting
-- is a new column with a default, which the Worker already running ignores.
CREATE TABLE settings (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	accent_colour TEXT NOT NULL DEFAULT 'blue'
);
INSERT INTO settings (id) VALUES (1);
-- A change to the Settings is a change clients pick up when they poll.
CREATE TRIGGER settings_changed AFTER UPDATE ON settings BEGIN UPDATE changes SET number = number + 1; END;
