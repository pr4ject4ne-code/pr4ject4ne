-- Rollback for 015_doctor_contact_info.sql.

BEGIN;

ALTER TABLE doctors
  DROP COLUMN IF EXISTS contact_phone,
  DROP COLUMN IF EXISTS contact_email;

COMMIT;
