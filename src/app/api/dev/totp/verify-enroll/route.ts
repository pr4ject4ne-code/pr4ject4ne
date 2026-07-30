import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getDevUser, isPrimary } from '@/lib/dev-auth';
import { checkRateLimit } from '@/lib/auth';
import { decryptTotpSecret, verifyTotpCode, generateRecoveryCodes, hashRecoveryCode } from '@/lib/totp';
import { logAudit, clientIpFrom } from '@/lib/audit';

interface Body {
  code?: string;
}

/**
 * POST /api/dev/totp/verify-enroll — confirm a pending enrollment (started
 * via /api/dev/totp/enroll) with a live 6-digit code, primary-only, own
 * account only. On success: flips `totp_enabled` on, stamps
 * `totp_enrolled_at`, generates 8 recovery codes, stores only their SHA-256
 * hashes, and returns the PLAINTEXT codes exactly once in this response —
 * mirrors this app's existing "shown once" precedent (the IHN code / dev
 * temp-password flows) — they are never retrievable again after this call.
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  if (!dev || !isPrimary(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const allowed = await checkRateLimit(`totp_verify_enroll:${dev.id}`, 10, 3600);
  if (!allowed) return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);

  const body = await readJson<Body>(req);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const ip = clientIpFrom(req.headers);

  if (!dev.totp_secret_encrypted) {
    return apiError('Start enrollment first.', 'NO_PENDING_ENROLLMENT', 400);
  }
  if (dev.totp_enabled) {
    return apiError('Two-factor authentication is already enabled.', 'ALREADY_ENABLED', 400);
  }
  if (!code) return apiError('A 6-digit code is required.', 'MISSING_CODE', 400);

  const secret = decryptTotpSecret(dev.totp_secret_encrypted);
  if (!verifyTotpCode(secret, code)) {
    await logAudit({
      userId: dev.id,
      action: 'totp_verify_failed',
      resourceType: 'user',
      resourceId: dev.id,
      details: { op: 'verify_enroll' },
      ip,
    });
    return apiError('Invalid code.', 'INVALID_CODE', 401);
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashedCodes = recoveryCodes.map(hashRecoveryCode);

  await query(
    `UPDATE users
     SET totp_enabled = true, totp_enrolled_at = now(), totp_recovery_codes = $2
     WHERE id = $1 AND account_type = 'developer'`,
    [dev.id, hashedCodes],
  );

  // Never include the raw secret or recovery codes in the audit trail.
  await logAudit({
    userId: dev.id,
    action: 'totp_enrolled',
    resourceType: 'user',
    resourceId: dev.id,
    ip,
  });

  return apiOk({ success: true, recovery_codes: recoveryCodes });
}
