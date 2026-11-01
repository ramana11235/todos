-- Prompts wait here until the Session they are for can take them.
CREATE TABLE prompts (
	id TEXT PRIMARY KEY,
	thread_id TEXT NOT NULL REFERENCES threads(id),
	text TEXT,
	created_at TEXT NOT NULL
);
