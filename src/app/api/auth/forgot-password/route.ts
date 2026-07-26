import { findUserByEmail, isValidEmail, checkRateLimit } from '@/lib/auth';
import { createPasswordResetToken } from '@/lib/password-reset';
import { sendEmail } from '@/lib/email';
import { buildPasswordResetEmail, buildResetPasswordUrl } from '@/lib/email-templates';
import { apiOk, readJson } from '@/lib/api';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { logger, errMessage } from '@/lib/logger';

interface Body {
  email?: string;
}

/** Approximates the typical token-insert + email-provider round trip a hit
 * incurs, so a miss doesn't respond in measurably less time (enumeration
 * timing side-channel). Not meant to match worst-case latency (the provider
 * call has its own multi-second timeout) — just the common-case gap. */
const MISS_BRANCH_DELAY_MS = 250;

/**
 * POST /api/auth/forgot-password — public, unauthenticated by nature.
 *
 * Enumeration-safe: EVERY branch (unknown email, invalid-format email, real
 * account, rate-limited) returns the exact same generic JSON response, so a
 * caller can't tell an unregistered address from a registered one, or a
 * throttled request from an accepted one.
 *
 * Timing note: unlike login, this path does not need a bcrypt call on the
 * miss branch (there is no password to compare), so there is no
 * dummy-bcrypt-hash equivalent to apply here. A syntactically invalid email
 * short-circuits before the DB lookup — that only reveals "not a valid email
 * shape", not "not a registered account", so it is not an enumeration leak. A
 * valid-format miss still does the same `findUserByEmail` lookup a hit does,
 * so the two cases share a query. A genuine hit additionally creates a token
 * row and calls the outbound email provider (real network latency, e.g.
 * Resend's own response time) — a security audit flagged this as a real,
 * if low-severity given the rate limits below, timing side-channel. Closed
 * via `MISS_BRANCH_DELAY_MS`: the miss branch sleeps a fixed interval
 * approximating that typical cost, same spirit as login's dummy-bcrypt
 * equalization, rather than making the hit branch fire-and-forget (which
 * would race the response and make token/email creation unobservable —
 * including to this route's own tests).
 *
 * Rate-limited on two independent dimensions: per-IP (bounds a single client
 * spraying many target emails — the email-bombing abuse case) and per-email
 * (bounds repeated resets hammering one inbox from many sources).
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const rawEmail = typeof body?.email === 'string' ? body.email.trim() : '';
  const ip = clientIpFrom(req.headers) ?? 'unknown';

  const GENERIC_MESSAGE = 'If that email address has an account, we\'ve sent a password reset link.';

  const ipAllowed = await checkRateLimit(`forgot_password_ip:${ip}`, 5, 3600);
  const emailBucket = rawEmail ? rawEmail.toLowerCase() : `noemail:${ip}`;
  const emailAllowed = await checkRateLimit(`forgot_password_email:${emailBucket}`, 3, 3600);

  if (!ipAllowed || !emailAllowed) {
    await logAudit({
      userId: null,
      action: 'rate_limited',
      resourceType: 'user',
      details: { endpoint: 'forgot_password' },
      ip,
    });
    // Same generic response as the success path — the rate-limited state is
    // never revealed to the caller.
    return apiOk({ message: GENERIC_MESSAGE });
  }

  if (isValidEmail(rawEmail)) {
    const user = await findUserByEmail(rawEmail);
    if (user && user.is_active) {
      try {
        const token = await createPasswordResetToken(user.id);
        const resetUrl = buildResetPasswordUrl(token);
        const { subject, html, text } = buildPasswordResetEmail(resetUrl);
        const result = await sendEmail({ to: user.email, subject, html, text });
        if (!result.sent) {
          logger.warn('password_reset_email_not_sent', { user_id: user.id });
        }
      } catch (err) {
        // Never let a token-creation or email-send failure surface to the
        // caller — the response is identical either way.
        logger.error('password_reset_email_failed', { user_id: user.id, error: errMessage(err) });
      }
      await logAudit({
        userId: user.id,
        action: 'password_reset_requested',
        resourceType: 'user',
        resourceId: user.id,
        details: { found: true },
        ip,
      });
    } else {
      // Timing-equalization for the miss branch: a genuine hit does a token
      // insert + an outbound email-provider call, which takes real (if
      // typically small) network time a miss otherwise wouldn't spend —
      // security-audit-flagged as a minor enumeration timing oracle. Close it
      // with a fixed delay approximating that typical cost, same spirit as
      // login's dummy-bcrypt-on-miss equalization elsewhere in this codebase,
      // rather than making the hit branch fire-and-forget (which would race
      // against the response and make token/email creation unobservable to
      // the caller — including tests — entirely).
      await new Promise((resolve) => setTimeout(resolve, MISS_BRANCH_DELAY_MS));
      await logAudit({
        userId: null,
        action: 'password_reset_requested',
        resourceType: 'user',
        details: { found: false },
        ip,
      });
    }
  }

  return apiOk({ message: GENERIC_MESSAGE });
}
