CREATE TABLE tasks (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	place TEXT NOT NULL,
	thread_id TEXT REFERENCES threads(id),
	position REAL NOT NULL,
	date TEXT,
	state TEXT NOT NULL,
	ended_at TEXT,
	created_at TEXT NOT NULL
);
