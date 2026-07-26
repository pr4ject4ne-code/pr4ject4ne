import { checkRateLimit } from '@/lib/auth';
import { consumePasswordResetToken } from '@/lib/password-reset';
import { apiError, apiOk, readJson } from '@/lib/api';
import { logAudit, clientIpFrom } from '@/lib/audit';

interface Body {
  token?: string;
  newPassword?: string;
}

const FAILURE_MESSAGES: Record<string, string> = {
  invalid: 'This reset link is invalid.',
  expired: 'This reset link has expired. Please request a new one.',
  used: 'This reset link has already been used.',
};

/**
 * POST /api/auth/reset-password — public, unauthenticated (the token itself
 * is the credential, same posture as GET /api/auth/verify-email). Rate-limited
 * per IP (the 32-byte random token is not brute-forceable, but this bounds
 * scanning/abuse regardless), and every outcome — success AND every failure
 * reason, including the rate-limited path itself — is audit-logged.
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const token = typeof body?.token === 'string' ? body.token : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  const ip = clientIpFrom(req.headers) ?? 'unknown';

  const allowed = await checkRateLimit(`reset_password:${ip}`, 10, 3600);
  if (!allowed) {
    await logAudit({
      userId: null,
      action: 'rate_limited',
      resourceType: 'user',
      details: { endpoint: 'reset_password' },
      ip,
    });
    return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);
  }

  const result = await consumePasswordResetToken(token, newPassword);

  await logAudit({
    userId: result.userId ?? null,
    action: 'password_reset_completed',
    resourceType: 'user',
    resourceId: result.userId,
    details: { success: result.ok, reason: result.ok ? undefined : result.reason },
    ip,
  });

  if (!result.ok) {
    if (result.reason === 'weak_password') {
      return apiError(result.message ?? 'Password does not meet requirements.', 'WEAK_PASSWORD', 400);
    }
    const message: string = FAILURE_MESSAGES[result.reason ?? 'invalid'] ?? FAILURE_MESSAGES.invalid!;
    return apiError(message, (result.reason ?? 'invalid').toUpperCase(), 400);
  }

  return apiOk({ success: true });
}
