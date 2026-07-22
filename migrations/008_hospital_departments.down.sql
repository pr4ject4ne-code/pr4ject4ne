-- Rollback for 008_hospital_departments.sql.

BEGIN;

ALTER TABLE hospitals DROP COLUMN IF EXISTS departments;

COMMIT;
