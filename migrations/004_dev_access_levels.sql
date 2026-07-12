-- Racoon Eye — three-level dev/admin model.
--
-- Levels: primary (executive), secondary (operational). Tertiary is the existing
-- hospital_staff account_type (institution outlook management), so it needs no new
-- access_level value. This renames the old free-text access_level values and pins
-- the allowed set with a CHECK constraint.
--
--   admin            -> primary
--   first_aid_editor -> secondary
--
-- Reversible: see migrations/004_dev_access_levels.down.sql for rollback.

BEGIN;

UPDATE users SET access_level = 'primary'   WHERE access_level = 'admin';
UPDATE users SET access_level = 'secondary' WHERE access_level = 'first_aid_editor';

-- Any developer must carry a valid level; non-developers keep NULL.
ALTER TABLE users
  ADD CONSTRAINT users_access_level_chk
  CHECK (access_level IS NULL OR access_level IN ('primary', 'secondary'));

COMMIT;
