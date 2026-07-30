import { cookies } from 'next/headers';
import {
  createSession,
  sessionCookieOptions,
  DEV_SESSION_COOKIE,
  findUserById,
  hashToken,
  checkRateLimit,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_SECONDS,
} from '@/lib/auth';
import { decryptTotpSecret, verifyTotpCode, matchRecoveryCode } from '@/lib/totp';
import { query, queryOne, withTransaction } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { logAudit, clientIpFrom } from '@/lib/audit';

interface Body {
  challenge_token?: string;
  code?: string;
}

/**
 * POST /api/auth/login/totp — second step of login for a primary developer
 * with 2FA enabled (see the mfa_required branch in /api/auth/login). Accepts
 * either a live 6-digit TOTP code or an unused recovery code.
 *
 * Rate-limited on BOTH the challenge-owning user id and the requester IP,
 * matching the threshold the normal login route uses for repeated failures
 * (LOGIN_MAX_ATTEMPTS / LOGIN_WINDOW_SECONDS) — a stolen/guessed
 * challenge_token still can't be brute-forced past that.
 *
 * The challenge row is consumed via a single atomic `UPDATE ... WHERE
 * consumed_at IS NULL AND expires_at > now() RETURNING id` (same
 * TOCTOU-avoidance pattern used by /api/biodata/ihn-code/regenerate) rather
 * than a bare SELECT-then-UPDATE, so two concurrent requests for the same
 * token can never both succeed. When the code used is a recovery code, its
 * removal from `totp_recovery_codes` is folded into the same
 * transaction as the challenge consumption.
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const challengeToken = typeof body.challenge_token === 'string' ? body.challenge_token : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const ip = clientIpFrom(req.headers);

  if (!challengeToken || !code) {
    return apiError('A challenge token and code are required.', 'MISSING_FIELDS', 400);
  }

  const ipAllowed = await checkRateLimit(
    `login_totp_ip:${ip ?? 'unknown'}`,
    LOGIN_MAX_ATTEMPTS,
    LOGIN_WINDOW_SECONDS,
  );
  if (!ipAllowed) {
    await logAudit({ action: 'rate_limited', resourceType: 'login_totp', ip });
    return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);
  }

  const tokenHash = hashToken(challengeToken);
  const challenge = await queryOne<{
    id: string;
    user_id: string;
    consumed_at: string | null;
    is_expired: boolean;
  }>(
    `SELECT id, user_id, consumed_at, (expires_at < now()) AS is_expired
     FROM mfa_challenges WHERE token_hash = $1`,
    [tokenHash],
  );

  async function fail(userId: string | null) {
    await logAudit({ userId, action: 'totp_verify_failed', resourceType: 'login', ip });
    return apiError('Invalid or expired code.', 'INVALID_CODE', 401);
  }

  if (challenge) {
    const userAllowed = await checkRateLimit(
      `login_totp_user:${challenge.user_id}`,
      LOGIN_MAX_ATTEMPTS,
      LOGIN_WINDOW_SECONDS,
    );
    if (!userAllowed) {
      await logAudit({ userId: challenge.user_id, action: 'rate_limited', resourceType: 'login_totp', ip });
      return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);
    }
  }

  if (!challenge || challenge.consumed_at || challenge.is_expired) {
    return fail(challenge?.user_id ?? null);
  }

  const user = await findUserById(challenge.user_id);
  // Structural re-check: a challenge should only ever exist for a primary
  // developer with totp_enabled (see /api/auth/login), but re-verify here too
  // rather than trusting the row's mere existence.
  if (
    !user ||
    !user.is_active ||
    user.account_type !== 'developer' ||
    user.access_level !== 'primary' ||
    !user.totp_enabled ||
    !user.totp_secret_encrypted
  ) {
    return fail(challenge.user_id);
  }

  const secret = decryptTotpSecret(user.totp_secret_encrypted);
  let matchedRecoveryHash: string | null = null;
  let verified = verifyTotpCode(secret, code);
  if (!verified) {
    matchedRecoveryHash = matchRecoveryCode(user.totp_recovery_codes, code);
    verified = matchedRecoveryHash !== null;
  }
  if (!verified) return fail(user.id);

  const consumed = await withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `UPDATE mfa_challenges SET consumed_at = now()
       WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()
       RETURNING id`,
      [challenge.id],
    );
    if (!rows[0]) return false;

    if (matchedRecoveryHash) {
      // Atomically remove ONLY this exact recovery code, and only if it's
      // still present — guards the same code being redeemed twice via two
      // different (both otherwise-valid) challenge tokens concurrently.
      const { rows: codeRows } = await tx.query<{ id: string }>(
        `UPDATE users SET totp_recovery_codes = array_remove(totp_recovery_codes, $2)
         WHERE id = $1 AND $2 = ANY(totp_recovery_codes)
         RETURNING id`,
        [user.id, matchedRecoveryHash],
      );
      if (!codeRows[0]) return false;
    }
    return true;
  });
  if (!consumed) return fail(user.id);

  const { token, expiresAt } = await createSession(user.id, user.account_type);
  (await cookies()).set(DEV_SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  await query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);
  await logAudit({
    userId: user.id,
    action: 'login',
    resourceType: user.account_type,
    resourceId: user.id,
    details: { via: 'totp' },
    ip,
  });

  return apiOk({
    success: true,
    user_id: user.id,
    account_type: user.account_type,
    access_level: user.access_level,
    hospital_id: user.hospital_id,
    redirect: '/dev/dashboard',
  });
}
