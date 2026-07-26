-- Rollback for 016_doctor_consent_patient_scope.sql.

BEGIN;

DROP INDEX IF EXISTS idx_doctor_consent_records_doctor_patient;
CREATE INDEX idx_doctor_consent_records_doctor ON doctor_consent_records (doctor_id, created_at DESC);

ALTER TABLE doctor_consent_records
  DROP COLUMN IF EXISTS patient_user_id;

COMMIT;
