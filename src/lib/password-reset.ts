import { randomBytes } from 'node:crypto';
import { query, withTransaction } from '@/lib/db';
import { hashToken, hashPassword } from '@/lib/auth';
import { validatePasswordStrength } from '@/lib/validation';

/**
 * Password reset tokens (worklist #19). Mirrors the exact security posture of
 * src/lib/email-verification.ts (worklist #18) — cryptographically random raw
 * token, only its SHA-256 hash stored, `SELECT ... FOR UPDATE` inside a
 * transaction for atomic single-use consumption, expiry compared in SQL (DB
 * clock authoritative) rather than app-clock.
 *
 * Expiry is much shorter than email verification's 48h: a leaked/guessed
 * reset token is a full account takeover, not just a verified-flag flip. 45
 * minutes is enough to open an email client and click through, short enough
 * to sharply bound the takeover window if a link leaks.
 */
const TOKEN_TTL_MS = 45 * 60 * 1000; // 45 minutes

export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}

/** Create + store a new reset token for a user; returns the RAW token to email. */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = generateResetToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
  return token;
}

export type ResetFailureReason = 'invalid' | 'expired' | 'used' | 'weak_password';

export interface ResetResult {
  ok: boolean;
  userId?: string;
  reason?: ResetFailureReason;
  /** Human-readable detail for the weak_password case only. */
  message?: string;
}

/**
 * Validate + consume a raw reset token: sets a new (policy-compliant)
 * password, marks the token used, and kills EVERY session for that user
 * (mirrors the "kill all other sessions" behavior of `PATCH
 * /api/account/password` in src/app/api/account/password/route.ts — except
 * there is no "caller's own session" to preserve here, since this endpoint is
 * reached unauthenticated via an emailed link, so ALL sessions are dropped to
 * force re-authentication everywhere).
 *
 * Never throws on a bad/expired/already-used token or a weak new password —
 * returns a typed failure reason instead so the caller can render/respond
 * accordingly. Password-strength is checked BEFORE touching the token row so
 * a request with an obviously-bad password never holds the row lock.
 * Similarly, the bcrypt hash only runs once the token is confirmed to be
 * valid/live/unused, so an invalid/expired/used token costs no bcrypt CPU.
 */
export async function consumePasswordResetToken(
  token: string,
  newPassword: string,
): Promise<ResetResult> {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'invalid' };

  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) return { ok: false, reason: 'weak_password', message: strength.reason };

  const tokenHash = hashToken(token);

  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      user_id: string;
      used_at: string | null;
      is_expired: boolean;
    }>(
      `SELECT id, user_id, used_at, (expires_at < now()) AS is_expired
       FROM password_reset_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return { ok: false, reason: 'invalid' };
    if (row.used_at) return { ok: false, reason: 'used' };
    // Compared in SQL (DB clock authoritative), matching the pattern already
    // used for session and email-verification-token expiry.
    if (row.is_expired) return { ok: false, reason: 'expired' };

    const passwordHash = await hashPassword(newPassword);
    await tx.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);
    await tx.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
      row.user_id,
      passwordHash,
    ]);
    // Kill EVERY session for this user — a password reset must force
    // re-authentication everywhere, not just for other devices.
    await tx.query(`DELETE FROM sessions WHERE user_id = $1`, [row.user_id]);

    return { ok: true, userId: row.user_id };
  });
}
