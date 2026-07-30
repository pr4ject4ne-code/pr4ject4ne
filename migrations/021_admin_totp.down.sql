-- Rollback for migrations/021_admin_totp.sql.

BEGIN;

DROP TABLE IF EXISTS mfa_challenges;

ALTER TABLE users
  DROP COLUMN IF EXISTS totp_secret_encrypted,
  DROP COLUMN IF EXISTS totp_enabled,
  DROP COLUMN IF EXISTS totp_recovery_codes,
  DROP COLUMN IF EXISTS totp_enrolled_at;

COMMIT;
