-- Racoon Eye — item 7: admin ability to suspend/resume/delete a hospital,
-- which the existing status model (pending/approved/rejected — migration
-- 001) had no way to express. 'rejected' only applies to a still-pending
-- application that never went live; there was no status at all for taking
-- an already-approved, publicly-listed hospital down.

BEGIN;

ALTER TABLE hospitals DROP CONSTRAINT hospitals_status_check;
ALTER TABLE hospitals ADD CONSTRAINT hospitals_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

COMMIT;
