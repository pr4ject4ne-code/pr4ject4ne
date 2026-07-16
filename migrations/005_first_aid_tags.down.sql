DROP INDEX IF EXISTS idx_first_aid_tags;
ALTER TABLE first_aid_entries DROP COLUMN IF EXISTS tags;
