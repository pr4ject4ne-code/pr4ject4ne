BEGIN;

ALTER TABLE department_ratings ADD COLUMN score SMALLINT NOT NULL DEFAULT 3 CHECK (score BETWEEN 1 AND 5);
ALTER TABLE department_ratings
  DROP COLUMN staff_score,
  DROP COLUMN service_score,
  DROP COLUMN infrastructure_score,
  DROP COLUMN review;

COMMIT;
