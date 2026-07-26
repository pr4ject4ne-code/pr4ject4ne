-- Racoon Eye — email confirmation system (worklist #18).
--
-- Adds `users.email_verified` and a hashed, single-use, expiring token table
-- for confirming a new signup's email address. Follows the exact hashed-token
-- pattern already established for `sessions.token_hash` (src/lib/auth.ts):
-- only a SHA-256 hash of the random token is ever stored, so a DB leak alone
-- can't be replayed as a live verification link.
--
-- Existing accounts pre-date this feature entirely — backfilling them to
-- email_verified = TRUE (not FALSE) so this migration never locks an
-- already-signed-up user out of their own account. Only new signups going
-- forward are required to verify (and even then, verification is a
-- non-blocking nudge per the app's current UX decision — see
-- src/app/dashboard/DashboardClient.tsx / SECURITY.md).
--
-- Reversible: see migrations/010_email_verification.down.sql for rollback.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

UPDATE users SET email_verified = true;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 of the random token; raw token only ever in the emailed link
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,          -- set on first successful consumption; enforces single-use
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_hash ON email_verification_tokens (token_hash);

COMMIT;
