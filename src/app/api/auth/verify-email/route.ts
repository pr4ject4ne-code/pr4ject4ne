import { NextResponse } from 'next/server';
import { consumeEmailVerificationToken } from '@/lib/email-verification';
import { checkRateLimit } from '@/lib/auth';
import { logAudit, clientIpFrom } from '@/lib/audit';

/**
 * GET /api/auth/verify-email?token=... — the link a user clicks from their
 * confirmation email. Public + unauthenticated by nature (the token itself is
 * the credential), so:
 *  - rate-limited per IP (defense in depth; the 32-byte random token is not
 *    brute-forceable, but this bounds abuse/scanning regardless);
 *  - every outcome (success AND failure) is audit-logged, per this project's
 *    security posture for auth-adjacent surfaces;
 *  - redirects (not JSON) to /verify-email, since this endpoint is meant to be
 *    opened directly in a browser from an email client, not called via fetch.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const ip = clientIpFrom(req.headers);

  const allowed = await checkRateLimit(`verify_email:${ip ?? 'unknown'}`, 20, 3600);
  if (!allowed) {
    await logAudit({
      userId: null,
      action: 'rate_limited',
      resourceType: 'user',
      details: { endpoint: 'verify_email' },
      ip,
    });
    return NextResponse.redirect(new URL('/verify-email?status=rate_limited', req.url));
  }

  const result = await consumeEmailVerificationToken(token);

  await logAudit({
    userId: result.userId ?? null,
    action: 'email_verified',
    resourceType: 'user',
    resourceId: result.userId,
    details: { success: result.ok, reason: result.ok ? undefined : result.reason },
    ip,
  });

  const status = result.ok ? 'success' : (result.reason ?? 'invalid');
  return NextResponse.redirect(new URL(`/verify-email?status=${status}`, req.url));
}
