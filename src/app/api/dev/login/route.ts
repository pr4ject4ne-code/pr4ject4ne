import { cookies } from 'next/headers';
import {
  verifyPassword,
  createSession,
  sessionCookieOptions,
  DEV_SESSION_COOKIE,
  findUserByEmail,
  checkLoginRateLimit,
  DUMMY_PASSWORD_HASH,
} from '@/lib/auth';
import { requiresLoginMfa, createLoginMfaChallenge } from '@/lib/totp';
import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { isValidEmail } from '@/lib/validation';
import { logAudit, clientIpFrom } from '@/lib/audit';

interface Body {
  email?: string;
  password?: string;
}

/** Developer login — separate session cookie, stricter rate limit (5 / 5 min). */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = clientIpFrom(req.headers);

  if (!isValidEmail(email) || !password) {
    return apiError('Email and password are required.', 'MISSING_CREDENTIALS', 400);
  }

  const allowed = await checkLoginRateLimit(email);
  if (!allowed) {
    await logAudit({ action: 'rate_limited', resourceType: 'dev_login', details: { email }, ip });
    return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);
  }

  const user = await findUserByEmail(email);
  const isDev = user?.account_type === 'developer';
  // Equalize timing on the miss path (see patient login) — dummy bcrypt when
  // there's no valid developer to compare against.
  const ok = await verifyPassword(
    password,
    user && isDev ? user.password_hash : DUMMY_PASSWORD_HASH,
  );

  if (!user || !isDev || !ok || !user.is_active) {
    await logAudit({
      userId: user?.id ?? null,
      action: 'login_failed',
      details: { portal: 'dev', email },
      ip,
    });
    return apiError('Invalid email or password.', 'INVALID_CREDENTIALS', 401);
  }

  // Two-factor authentication is scoped to primary developer accounts only
  // (migration 021). This segregated portal must gate on the exact same
  // condition as the unified /api/auth/login — otherwise a totp_enabled
  // primary's password alone would issue a full session here, bypassing 2FA
  // entirely (this endpoint is reachable directly by any HTTP client, not just
  // the app's own login UI). Login is NOT complete yet: no session cookie, no
  // last_login update, no `login` audit row — those happen once the second
  // factor is verified, at /api/auth/login/totp (generic over the challenge
  // token regardless of which route created it).
  if (requiresLoginMfa(user)) {
    const challengeToken = await createLoginMfaChallenge(user.id);
    return apiOk({ mfa_required: true, challenge_token: challengeToken });
  }

  const { token, expiresAt } = await createSession(user.id, 'developer');
  (await cookies()).set(DEV_SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  await query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);
  await logAudit({
    userId: user.id,
    action: 'login',
    resourceType: 'dev',
    resourceId: user.id,
    ip,
  });

  return apiOk({ success: true });
}
