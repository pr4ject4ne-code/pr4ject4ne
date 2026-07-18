import { cookies } from 'next/headers';
import {
  verifyPassword,
  isValidEmail,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  DEV_SESSION_COOKIE,
  HOSPITAL_SESSION_COOKIE,
  findUserByEmail,
  checkLoginRateLimit,
  DUMMY_PASSWORD_HASH,
} from '@/lib/auth';
import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { logAudit, clientIpFrom } from '@/lib/audit';
import type { AccountType } from '@/types';

interface Body {
  email?: string;
  password?: string;
}

/** Cookie + post-login landing page for each account type. */
const ROUTING: Record<AccountType, { cookie: string; redirect: string }> = {
  patient: { cookie: SESSION_COOKIE, redirect: '/dashboard' },
  developer: { cookie: DEV_SESSION_COOKIE, redirect: '/dev/dashboard' },
  hospital_staff: { cookie: HOSPITAL_SESSION_COOKIE, redirect: '/hospital/dashboard' },
};

/**
 * Unified login entry — one email/password form for every account type. The
 * account's own `account_type` decides which session cookie is issued and where
 * the client is routed; the segregated dev/hospital login endpoints remain for
 * API clients but the UI enters here. Authorization is still enforced downstream:
 * a patient credential issues only a patient session and can never open a dev or
 * institution page (those pages check the matching session type).
 */
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
    await logAudit({ action: 'rate_limited', resourceType: 'login', details: { email }, ip });
    return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);
  }

  const user = await findUserByEmail(email);
  // Always run bcrypt (dummy hash on the miss path) to equalize timing.
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);

  // hospital_staff must additionally be linked to a hospital to be usable.
  const usable = !!user && ok && user.is_active &&
    (user.account_type !== 'hospital_staff' || !!user.hospital_id);

  if (!user || !usable) {
    await logAudit({ userId: user?.id ?? null, action: 'login_failed', details: { email }, ip });
    // Generic message — don't reveal whether the email exists.
    return apiError('Invalid email or password.', 'INVALID_CREDENTIALS', 401);
  }

  const route = ROUTING[user.account_type];
  const { token, expiresAt } = await createSession(user.id, user.account_type);
  (await cookies()).set(route.cookie, token, sessionCookieOptions(expiresAt));
  await query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);
  await logAudit({
    userId: user.id,
    action: 'login',
    resourceType: user.account_type,
    resourceId: user.hospital_id ?? user.id,
    ip,
  });

  return apiOk({
    success: true,
    user_id: user.id,
    account_type: user.account_type,
    access_level: user.access_level,
    hospital_id: user.hospital_id,
    redirect: route.redirect,
  });
}
