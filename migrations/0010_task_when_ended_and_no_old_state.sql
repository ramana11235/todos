-- A Task's list and Date become one When, and its state becomes Ended, as a
-- Thread's are (docs/adr/0005). An empty when_day or deadline means it has
-- none. Every client now uses these, so the old columns go, along with a
-- Thread's old state.
ALTER TABLE tasks ADD COLUMN when_kind TEXT NOT NULL DEFAULT 'inbox';
ALTER TABLE tasks ADD COLUMN when_day TEXT;
ALTER TABLE tasks ADD COLUMN ended TEXT NOT NULL DEFAULT 'not_ended';
UPDATE tasks SET
	when_kind = CASE WHEN date IS NOT NULL THEN 'on_day' ELSE place END,
	when_day = date,
	ended = CASE state WHEN 'open' THEN 'not_ended' ELSE state END;
ALTER TABLE tasks DROP COLUMN place;
ALTER TABLE tasks DROP COLUMN date;
ALTER TABLE tasks DROP COLUMN state;
ALTER TABLE threads DROP COLUMN state;
