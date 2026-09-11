-- Racoon Eye — item 8: "in-depth" (per-department) ratings become a 3-axis
-- breakdown (individuals/staff, service, infrastructure — equally weighted,
-- confirmed by the founder) plus an optional text review, replacing the
-- single undifferentiated 1-5 `score`.
--
-- NOT NULL on all three new score columns, no backfill: same reasoning as
-- migrations 016/029 — this table has no real production data yet (v1,
-- open beta), so every row must have all three scores from the start rather
-- than inventing fake historical values for existing rows.
--
-- `review` is nullable — a rating without written feedback is still valid,
-- same as the general_ratings table introduced alongside this one
-- (migration 032).
--
-- Reversible: see migrations/031_department_ratings_indepth.down.sql (drops
-- the new columns and restores `score`, defaulting it to 3 since a genuine
-- reverse-migration has no way to un-average three scores back into one
-- meaningful original value — this is a best-effort down migration for a
-- schema that has no real data yet, not a data-preserving one).

BEGIN;

ALTER TABLE department_ratings
  ADD COLUMN staff_score SMALLINT NOT NULL CHECK (staff_score BETWEEN 1 AND 5),
  ADD COLUMN service_score SMALLINT NOT NULL CHECK (service_score BETWEEN 1 AND 5),
  ADD COLUMN infrastructure_score SMALLINT NOT NULL CHECK (infrastructure_score BETWEEN 1 AND 5),
  ADD COLUMN review TEXT NULL;

ALTER TABLE department_ratings DROP COLUMN score;

COMMIT;
