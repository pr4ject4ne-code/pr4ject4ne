-- Racoon Eye — private vs public ownership flag on hospitals (worklist #13).
--
-- The homepage results panel needs a private/public filter, but the schema
-- has no ownership-type signal at all today (service_type only distinguishes
-- hospital/clinic/pharmacy/radiology/other, not who owns/runs it).
--
-- Chose a plain BOOLEAN (`is_private`) over a TEXT CHECK enum (the pattern
-- already used for `service_type`/`ownership` in other systems). Reasoning:
-- ownership here only ever has two meaningful states for this product
-- (privately-run vs. government/public facility) — there's no third value on
-- the horizon the way `service_type` has five. A CHECK-constrained enum
-- would just be a boolean with extra ceremony (string comparisons instead of
-- a native bit, an enum table to keep in sync with TS `AccessLevel`-style
-- unions). If a genuine third ownership category ever emerges (e.g.
-- "faith-based"/"NGO"), it's a small, non-breaking follow-up migration to
-- swap this for a TEXT enum then — not worth pre-building now.
--
-- Default FALSE (public) — there is no existing signal in scripts/seed.ts's
-- 6 Enugu facilities to infer real ownership from (no notes on who owns
-- National Orthopaedic Hospital vs. HealthPlus Pharmacy, etc.), and all 6 are
-- community-managed draft listings anyway (verified = FALSE), not verified
-- institutional accounts. Public/government-style is the safer silent
-- default for unknown data — it doesn't imply exclusivity/cost the way
-- defaulting to "private" might. Existing rows are explicitly backfilled to
-- FALSE below (not left to the column default) so this stays intentional and
-- auditable, matching the 007/008 migration convention. Verified hospital
-- staff can self-correct this via their own portal once that write path is
-- built (not part of this migration — homepage filtering only for #13).
--
-- Reversible: see migrations/009_hospital_ownership_type.down.sql for rollback.

BEGIN;

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

UPDATE hospitals SET is_private = false;

COMMIT;
