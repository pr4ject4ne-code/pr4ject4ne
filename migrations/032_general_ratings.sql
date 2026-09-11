-- Racoon Eye — item 8: "general" (per-hospital, overall) rating — separate
-- from the per-department "in-depth" breakdown (migration 031). One row per
-- (hospital, patient); a resubmission UPDATEs it (same upsert pattern as
-- department_ratings, see src/lib/general-ratings.ts).
--
-- Deliberately its own table rather than a department_id-less row inside
-- department_ratings: a general rating has no department_id at all (it's
-- about the hospital as a whole), and giving it its own table keeps the
-- 3-axis department columns from needing to tolerate NULLs for a completely
-- different kind of rating.

BEGIN;

CREATE TABLE general_ratings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      UUID NOT NULL REFERENCES hospitals (id) ON DELETE CASCADE,
  patient_user_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  score            SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  review           TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, patient_user_id)
);

CREATE INDEX idx_general_ratings_hospital ON general_ratings (hospital_id);
CREATE INDEX idx_general_ratings_patient ON general_ratings (patient_user_id);

COMMIT;
