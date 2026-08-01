-- Rollback for migrations/022_first_aid_region_system_tags.sql.

BEGIN;

DROP INDEX IF EXISTS idx_first_aid_region_tags;
DROP INDEX IF EXISTS idx_first_aid_system_tags;

ALTER TABLE first_aid_entries
  DROP COLUMN IF EXISTS region_tags,
  DROP COLUMN IF EXISTS system_tags;

COMMIT;
