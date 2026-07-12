-- Rollback for 004_dev_access_levels.sql.

BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_level_chk;

UPDATE users SET access_level = 'admin'            WHERE access_level = 'primary';
UPDATE users SET access_level = 'first_aid_editor' WHERE access_level = 'secondary';

COMMIT;
