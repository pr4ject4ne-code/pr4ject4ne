-- Racoon Eye v1 — per-department hospital ratings (Phase 1).
--
-- Open rating for v1: any authenticated patient may rate any approved
-- hospital's departments, no visit-verification. One row per
-- (hospital, department, patient) — a resubmission by the same patient for
-- the same department UPDATEs the existing row (see the ON CONFLICT upsert
-- in src/lib/department-ratings.ts) rather than creating a duplicate.
--
-- `department_id` deliberately has NO foreign key — it references an id
-- living inside `hospitals.departments` (a JSONB array element, migration
-- 023), and Postgres cannot target a FK at a JSONB array element. Validity is
-- instead enforced at INSERT time via an EXISTS check against
-- `jsonb_array_elements(hospitals.departments)` (src/lib/department-ratings.ts
-- submitDepartmentRating) — the INSERT itself IS the integrity check, no
-- separate SELECT-then-write TOCTOU gap. When a hospital owner later removes
-- a department, its ratings are explicitly cascade-deleted in application
-- code (cascadeDeleteRemovedDepartmentRatings) inside the same transaction as
-- the `departments` column write — NOT via ON DELETE CASCADE, since there is
-- no FK to carry one.
--
-- hospital_id and patient_user_id DO have real FKs (both reference actual
-- tables/columns), with ON DELETE CASCADE so a deleted hospital or deleted
-- user's ratings are cleaned up automatically.
--
-- IMPORTANT for future readers: the hospital-level aggregate
-- (hospitals.rating_avg/rating_count) is a PLAIN AVG/COUNT over every
-- department_ratings row for the hospital — `SELECT AVG(score), COUNT(*)
-- FROM department_ratings WHERE hospital_id = $1`. Do NOT "fix" this into a
-- per-department weighted sum. The founder's stated rule ("each department's
-- contribution weight = its share of the hospital's total rating count")
-- algebraically collapses to exactly this plain average:
--   Sum_i(dept_avg_i * dept_count_i) / Sum_i(dept_count_i) == AVG(score) over
--   every row, regardless of department grouping. A weighted-sum
--   implementation would compute the identical number with more code.
--
-- Reversible: see migrations/024_department_ratings.down.sql.

BEGIN;

CREATE TABLE department_ratings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      UUID NOT NULL REFERENCES hospitals (id) ON DELETE CASCADE,
  department_id    UUID NOT NULL,
  patient_user_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  score            SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, department_id, patient_user_id)
);

CREATE INDEX idx_department_ratings_hospital_dept ON department_ratings (hospital_id, department_id);
CREATE INDEX idx_department_ratings_patient ON department_ratings (patient_user_id);

COMMIT;
