-- Rollback for 007_hospital_show_doctors.sql.

BEGIN;

ALTER TABLE hospitals DROP COLUMN IF EXISTS show_doctors;

COMMIT;
