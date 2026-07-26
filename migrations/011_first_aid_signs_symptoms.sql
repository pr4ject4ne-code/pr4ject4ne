-- Racoon Eye — signs/symptoms field on first-aid entries (worklist #34).
--
-- Adds a "signs & symptoms indicating this applies" field, shown BEFORE the
-- process/procedure section, so a reader can tell whether the entry is even
-- indicated for what they're seeing before following the steps.
--
-- Reuses the SAME closed whitelist as the existing `tags` column
-- (src/lib/first-aid-tags.ts, FIRST_AID_TAGS) rather than inventing a second
-- tag list — deliberate, not an oversight. `tags` and `signs_symptoms` are a
-- genuinely different concept even though they share a vocabulary:
--   - `tags` is the topic/scenario CATEGORIZATION axis (added migration 005) —
--     used to filter/browse the whole catalog by subject ("show me every
--     Bleeding entry"), independent of whether any single entry's actual
--     signs/symptoms happen to match the tag it's filed under.
--   - `signs_symptoms` is per-entry CONTENT — the specific indicators that
--     tell a reader "this entry is relevant to what I'm seeing", displayed as
--     its own section before Process. It is not guaranteed to equal `tags`
--     (an entry tagged "Bleeding" for browsing purposes might list "visible
--     blood", "wound", "pale skin" etc. as its actual signs/symptoms — a
--     narrower/more specific list than the topic tag).
-- Repurposing `tags` for both would conflate "how this is filed" with "what
-- this looks like", and would make the topic-tag catalog filter noisy the
-- moment an entry's real symptom list needs a tag that doesn't fit its topic
-- categorization. A genuinely separate array column, same whitelist values,
-- is the simplest correct model — mirrors migration 005's shape exactly.
--
-- Reversible: see migrations/011_first_aid_signs_symptoms.down.sql.

BEGIN;

ALTER TABLE first_aid_entries ADD COLUMN IF NOT EXISTS signs_symptoms text[] NOT NULL DEFAULT '{}';

-- GIN index for fast containment (@>) filtering, mirroring idx_first_aid_tags.
CREATE INDEX IF NOT EXISTS idx_first_aid_signs_symptoms ON first_aid_entries USING GIN (signs_symptoms);

COMMIT;
