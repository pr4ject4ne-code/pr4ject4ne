-- Racoon Eye — TOTP-based two-factor authentication for primary admin/developer
-- accounts (`account_type = 'developer' AND access_level = 'primary'` — the
-- accounts that can revoke users and read every audit log, and previously had
-- no second factor at all). Self-serve opt-in: these columns default to "not
-- enrolled" for every existing account; nothing here forces enrollment.
--
-- `totp_secret_encrypted` stores the TOTP shared secret AES-256-GCM-encrypted
-- (see src/lib/totp.ts) rather than in plaintext — a DB leak alone must not be
-- enough to clone a primary's authenticator. `totp_recovery_codes` mirrors that
-- same "never store the usable secret" posture: only SHA-256 hashes of the
-- one-time recovery codes are kept (same hashing approach as
-- sessions.token_hash / password_reset_tokens.token_hash in src/lib/auth.ts),
-- the plaintext codes are shown to the account holder exactly once at
-- enrollment and never retrievable again.
--
-- `mfa_challenges` is a dedicated table, NOT a reuse of `sessions`, so a
-- pending (password-verified but not-yet-second-factor-verified) login can
-- never be read by any existing session-checking code path as a completed
-- login — every session-reading helper in src/lib/auth.ts / dev-auth.ts only
-- ever queries `sessions`. Same hashed, single-use, expiring token shape as
-- email_verification_tokens (migration 010) / password_reset_tokens
-- (migration 012): only a SHA-256 hash of the raw challenge token is stored.
--
-- Reversible: see migrations/021_admin_totp.down.sql.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_recovery_codes TEXT[],
  ADD COLUMN IF NOT EXISTS totp_enrolled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS mfa_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE, -- SHA-256 of the random challenge token; raw token only ever held client-side between the two login steps
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,          -- set on first successful second-factor verification; enforces single-use
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user ON mfa_challenges (user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_hash ON mfa_challenges (token_hash);

COMMIT;
