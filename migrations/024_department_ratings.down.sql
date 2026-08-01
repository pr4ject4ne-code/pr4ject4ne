-- Rollback for migrations/024_department_ratings.sql.

BEGIN;

DROP TABLE IF EXISTS department_ratings;

COMMIT;
