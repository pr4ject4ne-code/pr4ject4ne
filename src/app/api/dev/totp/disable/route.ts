import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getDevUser, isPrimary } from '@/lib/dev-auth';
import { checkRateLimit } from '@/lib/auth';
import { decryptTotpSecret, verifyTotpCode, matchRecoveryCode } from '@/lib/totp';
import { logAudit, clientIpFrom } from '@/lib/audit';

interface Body {
  code?: string;
}

/**
 * POST /api/dev/totp/disable — turn off 2FA for the caller's OWN account,
 * primary-only. Requires a currently-valid TOTP code OR an unused recovery
 * code (mirrors this app's existing "current password required" pattern for
 * sensitive account changes — see /api/biodata/ihn-code/regenerate and
 * /api/account/password — except the proof-of-possession here is the second
 * factor itself, not the account password). Clears every TOTP column.
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  if (!dev || !isPrimary(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const allowed = await checkRateLimit(`totp_disable:${dev.id}`, 10, 3600);
  if (!allowed) return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);

  const body = await readJson<Body>(req);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const ip = clientIpFrom(req.headers);

  if (!dev.totp_enabled || !dev.totp_secret_encrypted) {
    return apiError('Two-factor authentication is not enabled.', 'NOT_ENABLED', 400);
  }
  if (!code) return apiError('A code is required.', 'MISSING_CODE', 400);

  const secret = decryptTotpSecret(dev.totp_secret_encrypted);
  const verified =
    verifyTotpCode(secret, code) || matchRecoveryCode(dev.totp_recovery_codes, code) !== null;

  if (!verified) {
    await logAudit({
      userId: dev.id,
      action: 'totp_verify_failed',
      resourceType: 'user',
      resourceId: dev.id,
      details: { op: 'disable' },
      ip,
    });
    return apiError('Invalid code.', 'INVALID_CODE', 401);
  }

  await query(
    `UPDATE users
     SET totp_secret_encrypted = NULL, totp_enabled = false, totp_recovery_codes = NULL, totp_enrolled_at = NULL
     WHERE id = $1 AND account_type = 'developer'`,
    [dev.id],
  );

  await logAudit({
    userId: dev.id,
    action: 'totp_disabled',
    resourceType: 'user',
    resourceId: dev.id,
    ip,
  });

  return apiOk({ success: true });
}
