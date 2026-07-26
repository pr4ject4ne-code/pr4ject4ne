-- Rollback for 014_doctor_consent_records.sql.

BEGIN;

DROP TABLE IF EXISTS doctor_consent_records;

COMMIT;
