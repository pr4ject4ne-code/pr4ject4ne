import { cookies } from 'next/headers';
import { withTransaction } from '@/lib/db';
import {
  hashPassword,
  isValidEmail,
  validatePasswordStrength,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  findUserByEmail,
  checkRateLimit,
} from '@/lib/auth';
import { generateIhnCode } from '@/lib/ihn-code';
import { apiError, apiOk, readJson } from '@/lib/api';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { logger, errMessage } from '@/lib/logger';
import { createEmailVerificationToken } from '@/lib/email-verification';
import { sendEmail } from '@/lib/email';
import { buildWelcomeVerificationEmail, buildVerifyEmailUrl } from '@/lib/email-templates';

interface Body {
  email?: string;
  password?: string;
}

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!isValidEmail(email)) return apiError('Invalid email address.', 'INVALID_EMAIL', 400);
  const strength = validatePasswordStrength(password);
  if (!strength.ok) return apiError(strength.reason!, 'WEAK_PASSWORD', 400);

  // Throttle before the existence check and bcrypt: signup is unauthenticated and
  // each call costs a ~250ms bcrypt hash, so an unthrottled loop of fresh emails
  // is a CPU-DoS lever (and the pre-hash 409 is an enumeration oracle). Per-IP
  // bucket; see SECURITY.md on making the IP source trustworthy in production.
  const ip = clientIpFrom(req.headers) ?? 'unknown';
  const allowed = await checkRateLimit(`signup:${ip}`, 15, 3600);
  if (!allowed) return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);

  const existing = await findUserByEmail(email);
  if (existing) return apiError('Email already registered.', 'EMAIL_EXISTS', 409);

  const passwordHash = await hashPassword(password);

  // Create user + empty biodata + IHN code atomically. Retry on the very rare
  // IHN collision.
  let userId = '';
  let ihnCode = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    ihnCode = generateIhnCode();
    try {
      userId = await withTransaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, account_type)
           VALUES ($1, $2, 'patient') RETURNING id`,
          [email, passwordHash],
        );
        const id = rows[0]!.id;
        await tx.query(
          `INSERT INTO biodata (user_id, profile_layer, biodata_layer, ihn_code)
           VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
          [id, JSON.stringify({ email }), '{}', ihnCode],
        );
        return id;
      });
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      // Unique violation on ihn_code -> retry with a new code.
      if (message.includes('biodata_ihn_code_key') || message.includes('idx_biodata_ihn')) {
        continue;
      }
      // Unique violation on email (race) -> conflict.
      if (message.includes('users_email_key')) {
        return apiError('Email already registered.', 'EMAIL_EXISTS', 409);
      }
      logger.error('signup_failed', { error: message });
      return apiError('Could not create account.', 'SIGNUP_FAILED', 500);
    }
  }

  if (!userId) return apiError('Could not create account.', 'SIGNUP_FAILED', 500);

  // Verification token + welcome/confirmation email. Deliberately outside the
  // user-creation transaction (the account must exist regardless of whether
  // the email send succeeds) and never allowed to fail the signup response —
  // a Resend outage or a missing RESEND_API_KEY must not block account
  // creation, only the confirmation email itself degrades (loudly logged).
  try {
    const verificationToken = await createEmailVerificationToken(userId);
    const verifyUrl = buildVerifyEmailUrl(verificationToken);
    const { subject, html, text } = buildWelcomeVerificationEmail(verifyUrl);
    const result = await sendEmail({ to: email, subject, html, text });
    if (!result.sent) {
      logger.warn('signup_welcome_email_not_sent', { user_id: userId });
    }
  } catch (err) {
    logger.error('signup_welcome_email_failed', { user_id: userId, error: errMessage(err) });
  }

  const { token, expiresAt } = await createSession(userId, 'patient');
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  await logAudit({
    userId,
    action: 'login',
    resourceType: 'user',
    resourceId: userId,
    details: { via: 'signup' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, ihn_code: ihnCode, user_id: userId }, 201);
}
