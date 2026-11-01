-- A Thread's one state becomes three facts, whose move, When and Ended, and
-- a Thread can have a Deadline (docs/adr/0005). An empty when_day or
-- deadline means it has none. `state` stays, kept in step, for clients older
-- than these columns.
ALTER TABLE threads ADD COLUMN whose_move TEXT NOT NULL DEFAULT 'on_me';
ALTER TABLE threads ADD COLUMN when_kind TEXT NOT NULL DEFAULT 'active';
ALTER TABLE threads ADD COLUMN when_day TEXT;
ALTER TABLE threads ADD COLUMN ended TEXT NOT NULL DEFAULT 'not_ended';
ALTER TABLE threads ADD COLUMN deadline TEXT;
UPDATE threads SET
	whose_move = CASE state WHEN 'waiting' THEN 'waiting' ELSE 'on_me' END,
	when_kind = CASE state WHEN 'someday' THEN 'someday' ELSE 'active' END,
	ended = CASE WHEN state IN ('done', 'dropped') THEN state ELSE 'not_ended' END;
