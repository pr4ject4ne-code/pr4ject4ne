-- Racoon Eye — media (YouTube/native video + additional images) on first-aid entries.
--
-- The FirstAidDetail/FirstAidForm components already had a `media` field in
-- their local type (src/types/first-aid.ts), rendering/editing an array of
-- `{ id, media_type: 'image'|'video', url, provider? }` items — but no such
-- column ever existed on `first_aid_entries`, so `entry.media` was always
-- undefined against real data and nothing written in the form was ever
-- persisted. This migration adds the column so that UI is backed by a real
-- field. Stored as jsonb (small, dev-curated catalog; no need for a join
-- table or per-item indexing at this scale) rather than a separate table.
--
-- `images` (text[], legacy) is left as-is — `media` is additive, not a
-- replacement; FirstAidDetail already combines both for its gallery.
--
-- Reversible: see migrations/027_first_aid_media.down.sql.

BEGIN;

ALTER TABLE first_aid_entries
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]';

COMMIT;
