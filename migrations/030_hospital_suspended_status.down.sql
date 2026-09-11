-- Down migration only restores the constraint; if any row is currently
-- 'suspended' it must be moved to another status first, or this will fail —
-- which is the correct, safe behavior for a down migration (never silently
-- drop data into an invalid state).
BEGIN;

ALTER TABLE hospitals DROP CONSTRAINT hospitals_status_check;
ALTER TABLE hospitals ADD CONSTRAINT hospitals_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

COMMIT;
