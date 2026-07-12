import { cookies } from 'next/headers';
import {
  verifyPassword,
  createSession,
  sessionCookieOptions,
  DEV_SESSION_COOKIE,
  findUserByEmail,
  checkRateLimit,
  DUMMY_PASSWORD_HASH,
} from '@/lib/auth';
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

  const allowed = await checkRateLimit(`dev_login:${email.toLowerCase()}`, 5, 300);
  if (!allowed) return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);

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
