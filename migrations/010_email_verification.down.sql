-- Rollback for 010_email_verification.sql.

BEGIN;

DROP TABLE IF EXISTS email_verification_tokens;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;

COMMIT;
