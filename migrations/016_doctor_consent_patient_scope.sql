-- Racoon Eye — scope doctor consent to a (doctor, patient) pair (security fix
-- for a real vulnerability found in worklist #29/#30, commit a18ba4d).
--
-- THE BUG: `doctor_consent_records` (migration 014) recorded consent PER
-- DOCTOR only. `GET /api/hospitals/[id]` is a public, unauthenticated endpoint
-- that returns every hospital's doctor roster (id + name) — so any patient
-- could copy a real doctor's id from that public roster, PATCH it onto their
-- OWN fabricated `clinical_conditions[i].doctor_id`, and if that doctor had
-- EVER been marked `approved` for ANY other patient, the report generator
-- (src/lib/doctor-report.ts) would credit that real doctor's name/contact to
-- the fabricated entry. Consent answered "has this doctor ever consented to
-- attribution, period" instead of "did this doctor consent to being credited
-- for THIS patient's specific record".
--
-- THE FIX: consent is now scoped to a (doctor_id, patient_user_id) pair. Adds
-- `patient_user_id` referencing the biodata owner (`users.id`) whose record
-- the doctor is being asked to confirm. src/lib/doctor-consent-db.ts's
-- "most recent row wins" resolution now filters on BOTH columns, and every
-- call site (src/app/api/biodata/lookup/route.ts) passes the credited
-- patient's own user_id, not just the doctor_id.
--
-- NOT NULL, no backfill needed: this table was created THE SAME DAY as this
-- fix (migration 014, commit a18ba4d) and nothing in this repo ever inserts
-- into it outside the dev-only `/api/dev/doctor-consent` route — no seed
-- script (scripts/seed.ts), no bootstrap script, and no test fixture creates
-- a real row. A per-doctor-only approval is exactly the bug being fixed, so
-- there is no safe legacy meaning to preserve for any pre-existing row; if
-- any such row exists in a given environment it is itself part of the
-- vulnerability and should not be silently defaulted to some patient — hence
-- NOT NULL with no DEFAULT, requiring every row (old or new) to be explicit.
--
-- Reversible: see migrations/016_doctor_consent_patient_scope.down.sql.

BEGIN;

ALTER TABLE doctor_consent_records
  ADD COLUMN patient_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE;

-- The "current status for THIS doctor+patient pair" resolution now needs an
-- index keyed on both columns (mirrors idx_doctor_consent_records_doctor's
-- doctor_id-only shape from migration 014, extended with the new column).
DROP INDEX IF EXISTS idx_doctor_consent_records_doctor;
CREATE INDEX idx_doctor_consent_records_doctor_patient
  ON doctor_consent_records (doctor_id, patient_user_id, created_at DESC, id DESC);

COMMIT;
