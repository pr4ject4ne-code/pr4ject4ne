-- Racoon Eye — stable per-department ids (Phase 0 of the department rating
-- system; department ratings themselves land in migration 024).
--
-- `hospitals.departments` is a JSONB array of { name, services[] } objects
-- (migration 008) with no per-element identity — array position is the only
-- "key", which is unstable across edits/reorders/removals. Department-level
-- ratings need a stable id to attach a rating to a SPECIFIC department that
-- survives renames/reordering. Postgres cannot put a native FK on a JSONB
-- array element, so identity here is a plain `id` string field per element,
-- validated at write time via an EXISTS check (see
-- src/lib/department-ratings.ts) rather than a database-level foreign key.
--
-- This migration backfills a stable `id` (a UUID, stored as text) into every
-- existing department element that doesn't already have one. Idempotent —
-- safe to re-run; elements that already carry an `id` are left untouched, so
-- re-running never mints a second id for the same department.
--
-- Reversible: see migrations/023_department_ids.down.sql.

BEGIN;

UPDATE hospitals
SET departments = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN elem ? 'id' THEN elem
         ELSE elem || jsonb_build_object('id', gen_random_uuid()::text)
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(departments) AS elem
)
WHERE jsonb_array_length(departments) > 0;

COMMIT;
