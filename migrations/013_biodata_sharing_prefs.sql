-- Racoon Eye — biodata sharing preferences (worklist #23).
--
-- Adds a default-deny, per-section sharing-preferences map to `biodata` so an
-- account holder can opt specific sections into cross-user IHN-code reads
-- (see src/app/api/biodata/[userId]/route.ts). Every key defaults to
-- false/absent — nothing is shared via someone else's IHN lookup until the
-- owner explicitly toggles it on in the dashboard.
--
-- Granularity chosen (documented here + src/lib/sharing-prefs.ts): grouped by
-- logical section rather than one flag per individual field, since that is
-- both a reasonable sharing unit (e.g. "my blood type" is one decision, not
-- five) and keeps the toggle UI to a manageable ~9 switches instead of ~25:
--   profile              — the whole profile_layer (name/contact/next-of-kin/photo)
--   demographics          — occupation, marital_status, religious_status, tribe, ethnicity
--   anthropometrics        — height_cm, weight_kg, waist_cm, chest_cm, hip_cm, bmi
--   chronic_disease       — biodata_layer.chronic_disease (free-text lifestyle field)
--   genotype
--   blood_group
--   disability
--   health_preferences
--   clinical_conditions    — biodata_layer.clinical_conditions[] (timestamped conditions)
-- This set covers every BiodataLayer field that exists today (see
-- src/types/index.ts) so nothing can leak through an un-covered gap.
--
-- Reversible: see migrations/013_biodata_sharing_prefs.down.sql.

BEGIN;

ALTER TABLE biodata
  ADD COLUMN IF NOT EXISTS sharing_prefs JSONB NOT NULL DEFAULT '{}';

COMMIT;
