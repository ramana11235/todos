-- One number that goes up with every change to a Thread or a Task, so a
-- client can ask whether anything changed since the number it last saw and
-- read the Threads and Tasks again only when something did (issues 76 and 81).
-- Triggers keep it, so no write can forget to, and they cost no extra query.
CREATE TABLE changes (number INTEGER NOT NULL);
INSERT INTO changes (number) VALUES (0);
CREATE TRIGGER thread_added AFTER INSERT ON threads BEGIN UPDATE changes SET number = number + 1; END;
CREATE TRIGGER thread_changed AFTER UPDATE ON threads BEGIN UPDATE changes SET number = number + 1; END;
CREATE TRIGGER thread_removed AFTER DELETE ON threads BEGIN UPDATE changes SET number = number + 1; END;
CREATE TRIGGER task_added AFTER INSERT ON tasks BEGIN UPDATE changes SET number = number + 1; END;
CREATE TRIGGER task_changed AFTER UPDATE ON tasks BEGIN UPDATE changes SET number = number + 1; END;
CREATE TRIGGER task_removed AFTER DELETE ON tasks BEGIN UPDATE changes SET number = number + 1; END;
