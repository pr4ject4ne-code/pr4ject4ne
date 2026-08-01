-- Rollback for migrations/023_department_ids.sql.
--
-- Strips the `id` key back out of every department element. This is a LOSSY
-- rollback for the ids themselves (re-applying the forward migration mints
-- fresh ones, it does not restore the originals) — everything else about
-- each department (name, services) is preserved untouched.

BEGIN;

UPDATE hospitals
SET departments = (
  SELECT COALESCE(jsonb_agg(elem - 'id'), '[]'::jsonb)
  FROM jsonb_array_elements(departments) AS elem
)
WHERE jsonb_array_length(departments) > 0;

COMMIT;
