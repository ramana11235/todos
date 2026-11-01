CREATE TABLE threads (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	summary TEXT NOT NULL DEFAULT '',
	next_step TEXT NOT NULL DEFAULT '',
	state TEXT NOT NULL,
	waiting_on TEXT,
	parent_id TEXT REFERENCES threads(id),
	position REAL NOT NULL,
	directory TEXT,
	claude_session_id TEXT,
	session_pane TEXT,
	session_signal TEXT,
	updated_this_turn INTEGER NOT NULL DEFAULT 0,
	my_edit_at TEXT,
	session_update_at TEXT,
	created_at TEXT NOT NULL
);
