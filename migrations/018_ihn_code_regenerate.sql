-- Racoon Eye — allow a patient to regenerate their own IHN code, at most
-- once every 30 days, with their current password required (founder ask,
-- 2026-07-29 — not a numbered worklist item).
--
-- This is a deliberate reversal of the IHN code's original "static, never
-- rotates" design (see migrations/001_initial_schema.sql's own comment on
-- `biodata.ihn_code`, and the "This code never changes" copy in
-- IHNCodeDisplay.tsx, both updated alongside this migration) — the founder
-- explicitly asked for a way to rotate a compromised/over-shared code. The
-- 30-day cooldown and password requirement keep this a deliberate,
-- infrequent action rather than something that can be triggered casually or
-- by whoever is holding an already-open session.
--
-- `ihn_code_regenerated_at` starts NULL (never regenerated) so the cooldown
-- check in the API route treats a NULL as "eligible" rather than needing a
-- backfill for existing rows.
--
-- Reversible: see migrations/018_ihn_code_regenerate.down.sql.

BEGIN;

ALTER TABLE biodata ADD COLUMN ihn_code_regenerated_at TIMESTAMPTZ NULL;

COMMIT;
