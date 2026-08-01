-- Racoon Eye — region + system tag dimensions on first-aid entries.
--
-- Adds two NEW closed-vocabulary tag axes alongside the existing `tags`
-- (topic/scenario categorization, migration 005) and `signs_symptoms`
-- (migration 011) columns:
--   - `region_tags`  — WHERE on the body the entry concerns (Head & Neck,
--     Chest, Abdomen, ...). See src/lib/first-aid-region-tags.ts.
--   - `system_tags`  — WHICH body system(s) the entry concerns
--     (Cardiovascular, Respiratory, Special Senses, ...). See
--     src/lib/first-aid-system-tags.ts.
--
-- These are deliberately SEPARATE columns/whitelists from `tags`, not a
-- repurposing of it — `tags` is a single flat topic axis ("Choking",
-- "Chest pain"), while region/system are two independent anatomical
-- classification axes an entry can be filtered/browsed by simultaneously
-- (e.g. Chest pain: region=Chest, system=Cardiovascular). A deterministic
-- crosswalk from the existing 24 `tags` values derives sensible starting
-- region/system tags for existing entries — see
-- src/lib/first-aid-tag-crosswalk.ts and
-- scripts/backfill-first-aid-region-system-tags.ts. Neither axis is
-- required — an entry with no clean region/system fit is left empty rather
-- than forced into a poor match (e.g. Dental injury has no system fit even
-- with a dedicated "Special Senses" tag added for Eye injury/Nosebleed).
--
-- Reversible: see migrations/022_first_aid_region_system_tags.down.sql.

BEGIN;

ALTER TABLE first_aid_entries
  ADD COLUMN IF NOT EXISTS region_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS system_tags text[] NOT NULL DEFAULT '{}';

-- GIN indexes for fast containment (@>) filtering, mirroring idx_first_aid_tags
-- and idx_first_aid_signs_symptoms.
CREATE INDEX IF NOT EXISTS idx_first_aid_region_tags ON first_aid_entries USING GIN (region_tags);
CREATE INDEX IF NOT EXISTS idx_first_aid_system_tags ON first_aid_entries USING GIN (system_tags);

COMMIT;
