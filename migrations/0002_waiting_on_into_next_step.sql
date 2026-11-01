-- A Waiting Thread now says what it waits on in its next step, and the
-- time its summary last changed is kept.
ALTER TABLE threads ADD COLUMN summary_updated_at TEXT;
UPDATE threads SET next_step = 'Waiting on ' || waiting_on
	WHERE state = 'waiting' AND waiting_on IS NOT NULL AND next_step NOT LIKE 'waiting%';
UPDATE threads SET summary_updated_at = CASE
		WHEN my_edit_at IS NULL THEN session_update_at
		WHEN session_update_at IS NULL THEN my_edit_at
		ELSE max(my_edit_at, session_update_at) END
	WHERE summary <> '' OR next_step <> '';
ALTER TABLE threads DROP COLUMN waiting_on;
