-- Rollback for 009_hospital_ownership_type.sql.

BEGIN;

ALTER TABLE hospitals DROP COLUMN IF EXISTS is_private;

COMMIT;
