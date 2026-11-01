-- Thoughts is one page, so it is one row that is always there.
CREATE TABLE thoughts (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	text TEXT NOT NULL,
	version INTEGER NOT NULL
);
INSERT INTO thoughts (id, text, version) VALUES (1, '', 0);
