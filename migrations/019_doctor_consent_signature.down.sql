BEGIN;

ALTER TABLE doctor_consent_records
  DROP COLUMN doctor_email,
  DROP COLUMN doctor_signature;

COMMIT;
