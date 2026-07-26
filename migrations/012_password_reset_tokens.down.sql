-- Rollback for 012_password_reset_tokens.sql.

BEGIN;

DROP TABLE IF EXISTS password_reset_tokens;

COMMIT;
