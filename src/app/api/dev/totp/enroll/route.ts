import { query } from '@/lib/db';
import { apiError, apiOk } from '@/lib/api';
import { getDevUser, isPrimary } from '@/lib/dev-auth';
import { checkRateLimit } from '@/lib/auth';
import { generateTotpSecret, totpKeyUri, encryptTotpSecret } from '@/lib/totp';

/**
 * POST /api/dev/totp/enroll — start (or restart) 2FA enrollment for the
 * caller's OWN account. Primary-only (see docs/pages/primary-dev-page.md +
 * migration 021: 2FA is scoped to the accounts that can revoke users / read
 * every audit log). Self-serve opt-in — nothing here forces enrollment.
 *
 * Generates a new secret, encrypts it, and stores it with `totp_enabled`
 * still FALSE — the account only actually gains 2FA once the holder proves
 * they scanned/entered it correctly via /api/dev/totp/verify-enroll. Calling
 * this again before verifying just overwrites the pending (unconfirmed)
 * secret, which is fine — nothing was protected by it yet.
 */
export async function POST() {
  const dev = await getDevUser();
  if (!dev || !isPrimary(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const allowed = await checkRateLimit(`totp_enroll:${dev.id}`, 10, 3600);
  if (!allowed) return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);

  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret);

  await query(
    `UPDATE users SET totp_secret_encrypted = $2 WHERE id = $1 AND account_type = 'developer'`,
    [dev.id, encrypted],
  );

  return apiOk({ secret, otpauth_uri: totpKeyUri(dev.email, secret) });
}
