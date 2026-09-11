BEGIN;

DROP INDEX IF EXISTS idx_doctor_consent_records_doctor_patient_field;
CREATE INDEX idx_doctor_consent_records_doctor_patient
  ON doctor_consent_records (doctor_id, patient_user_id, created_at DESC, id DESC);

ALTER TABLE doctor_consent_records
  DROP COLUMN clinical_condition_id;

COMMIT;
