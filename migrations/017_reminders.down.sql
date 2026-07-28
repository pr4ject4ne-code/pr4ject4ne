-- Rollback for 017_reminders.sql.

BEGIN;

DROP TABLE IF EXISTS reminders;

COMMIT;
