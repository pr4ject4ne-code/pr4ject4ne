-- Racoon Eye — hospital departments with free-form services (worklist #14).
--
-- "Verified accounts can add and organize services based on departments that
-- can be subclassed as they see fit." The existing `specialties TEXT[]` is a
-- flat, unordered bag with no grouping — it stays as-is for the lightweight
-- directory-filter use case, but doesn't let an institution express
-- structure (e.g. "Surgery" containing "General Surgery"/"Orthopaedic
-- Surgery"/"Neurosurgery").
--
-- Per this project's existing convention (`hours` and `photos` are already
-- JSONB on this same table, not child tables), this is a JSONB column rather
-- than a new `departments`/`department_services` schema. Shape is
-- intentionally simple — an array of `{ name: string, services: string[] }`
-- objects:
--   [{ "name": "Surgery", "services": ["General Surgery", "Orthopaedics"] },
--    { "name": "Diagnostics", "services": ["X-Ray", "Ultrasound"] }]
-- "Subclassed as they see fit" is satisfied by the free-form `services` list
-- under each department name — there is no fixed taxonomy to keep this
-- editable by any verified institution without a schema change. Deeper
-- nested sub-departments were considered and rejected as over-engineering
-- for what the worklist item actually asks for.
--
-- Default `'[]'` so every existing hospital row (seeded + registered) starts
-- with an empty, valid departments list rather than NULL — callers can treat
-- the column as always-array, no null-checks needed.
--
-- Reversible: see migrations/008_hospital_departments.down.sql for rollback.

BEGIN;

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS departments JSONB NOT NULL DEFAULT '[]';

COMMIT;
