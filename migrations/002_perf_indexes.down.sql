-- Rollback for 002_perf_indexes.sql
BEGIN;

DROP INDEX IF EXISTS idx_first_aid_directory;
DROP INDEX IF EXISTS idx_hospitals_directory;

COMMIT;
