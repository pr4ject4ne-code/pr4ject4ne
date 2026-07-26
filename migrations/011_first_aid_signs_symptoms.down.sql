DROP INDEX IF EXISTS idx_first_aid_signs_symptoms;
ALTER TABLE first_aid_entries DROP COLUMN IF EXISTS signs_symptoms;
