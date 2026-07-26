-- Racoon Eye — forgot-password reset tokens (worklist #19).
--
-- Same hashed-token shape as email_verification_tokens (migration 010), but a
-- much SHORTER expiry: a leaked/guessed email-verification token only flips a
-- boolean, while a leaked/guessed password-reset token is a full account
-- takeover (attacker sets a new password, hijacks the session). Chosen
-- expiry: 45 minutes — enough time to open an email client and click
-- through, short enough to sharply bound the takeover window if the link
-- leaks (mailbox compromise, shared/public computer, forwarded email, a
-- link-preview crawler, etc.). See src/lib/password-reset.ts.
--
-- Reversible: see migrations/012_password_reset_tokens.down.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 of the random token; raw token only ever in the emailed link
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,          -- set on first successful consumption; enforces single-use
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash);

COMMIT;
