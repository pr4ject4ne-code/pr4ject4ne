-- Racoon Eye — scope doctor consent to a specific clinical_condition field,
-- not just the (doctor, patient) pair (item 4: "we approve based on
-- individual fields").
--
-- THE GAP: migration 016 scoped consent to (doctor_id, patient_user_id) to
-- fix a real fabricated-attribution vulnerability, but that still meant one
-- approval covered EVERY clinical_condition entry citing that doctor for
-- that patient. A doctor confirming one condition would silently also get
-- credited on any other condition a patient later attributes to them,
-- without ever having reviewed it.
--
-- THE FIX: add `clinical_condition_id`, referencing the stable `id` now
-- assigned to each biodata_layer.clinical_conditions[] entry (see
-- src/types/index.ts ClinicalCondition.id, src/lib/sanitize.ts). This can't
-- be a real FK — clinical_conditions lives inside a JSONB array, not a SQL
-- table — so it's a TEXT column holding that entry's id, validated as a
-- well-formed UUID by application code (src/lib/doctor-consent-db.ts), the
-- same trust model migration 016 already used for patient_user_id's
-- companion doctor_id column (both real FKs there; this one can't be, but
-- gets the same "never taken from unauthenticated input" discipline).
--
-- NOT NULL, no backfill, same reasoning as migration 016: this table has no
-- production data yet (dev-only /api/dev/doctor-consent route, no seed
-- script, no bootstrap script ever inserts into it) — every row, old or new,
-- must be explicit about which field it's scoped to.
--
-- Reversible: see migrations/029_doctor_consent_field_scope.down.sql.

BEGIN;

ALTER TABLE doctor_consent_records
  ADD COLUMN clinical_condition_id TEXT NOT NULL;

-- The "current status for THIS doctor+patient+field triple" resolution now
-- needs the field id in the lookup index (mirrors migration 016's own
-- index-widening when patient_user_id was added).
DROP INDEX IF EXISTS idx_doctor_consent_records_doctor_patient;
CREATE INDEX idx_doctor_consent_records_doctor_patient_field
  ON doctor_consent_records (doctor_id, patient_user_id, clinical_condition_id, created_at DESC, id DESC);

COMMIT;
