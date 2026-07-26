-- Rollback for 013_biodata_sharing_prefs.sql.

BEGIN;

ALTER TABLE biodata
  DROP COLUMN IF EXISTS sharing_prefs;

COMMIT;
