-- Reading a Thread now counts as the Session seeing it, and a turn that
-- only answered is no longer asked to update.
ALTER TABLE threads RENAME COLUMN session_update_at TO session_seen_at;
ALTER TABLE threads ADD COLUMN worked_this_turn INTEGER NOT NULL DEFAULT 0;
