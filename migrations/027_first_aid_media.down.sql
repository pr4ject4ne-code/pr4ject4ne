-- Rollback for migrations/027_first_aid_media.sql.

BEGIN;

ALTER TABLE first_aid_entries
  DROP COLUMN IF EXISTS media;

COMMIT;
