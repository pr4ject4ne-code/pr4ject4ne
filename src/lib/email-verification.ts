import { randomBytes } from 'node:crypto';
import { query, withTransaction } from '@/lib/db';
import { hashToken } from '@/lib/auth';

/**
 * Email verification tokens (worklist #18). Mirrors the exact hashed-token
 * security posture already established for session tokens in src/lib/auth.ts
 * (src/lib/auth.ts:generateSessionToken/hashToken) — a cryptographically
 * random raw token is only ever sent to the user (in the email link); only
 * its SHA-256 hash is stored, so a DB leak alone can't be replayed as a live
 * verification link.
 *
 * Expiry: 48 hours. Long enough that a user who doesn't check their inbox
 * same-day still has a working link the next day; short enough to bound how
 * long a leaked/forwarded link stays exploitable. Single-use is enforced via
 * `used_at` (set atomically with the verification, under a row lock — see
 * consumeEmailVerificationToken).
 */
const TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

/** Create + store a new verification token for a user; returns the RAW token to email. */
export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = generateVerificationToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
  return token;
}

export type VerifyFailureReason = 'invalid' | 'expired' | 'used';

export interface VerifyResult {
  ok: boolean;
  userId?: string;
  reason?: VerifyFailureReason;
}

/**
 * Validate + consume a raw verification token: marks it used and flips
 * users.email_verified = true, atomically. Uses `SELECT ... FOR UPDATE`
 * inside a transaction (same defense-in-depth class as the advisory-lock rate
 * limiter in auth.ts) so two concurrent requests with the same token can't
 * both succeed — the second sees the row already marked used.
 *
 * Never throws on a bad/expired/already-used token — returns a typed failure
 * reason instead so the caller can render/redirect accordingly.
 */
export async function consumeEmailVerificationToken(token: string): Promise<VerifyResult> {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'invalid' };
  const tokenHash = hashToken(token);

  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      user_id: string;
      used_at: string | null;
      is_expired: boolean;
    }>(
      `SELECT id, user_id, used_at, (expires_at < now()) AS is_expired
       FROM email_verification_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return { ok: false, reason: 'invalid' };
    if (row.used_at) return { ok: false, reason: 'used' };
    // Compared in SQL (DB clock authoritative), matching the pattern
    // getSession() uses for session-token expiry in auth.ts, rather than
    // pulling the timestamp out and comparing against the app server's clock.
    if (row.is_expired) return { ok: false, reason: 'expired' };

    await tx.query(`UPDATE email_verification_tokens SET used_at = now() WHERE id = $1`, [row.id]);
    await tx.query(`UPDATE users SET email_verified = true WHERE id = $1`, [row.user_id]);

    return { ok: true, userId: row.user_id };
  });
}
