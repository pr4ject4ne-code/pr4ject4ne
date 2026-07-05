import { cookies } from 'next/headers';
import {
  verifyPassword,
  isValidEmail,
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  findUserByEmail,
  checkRateLimit,
} from '@/lib/auth';
import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { logAudit, clientIpFrom } from '@/lib/audit';

interface Body {
  email?: string;
  password?: string;
}

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = clientIpFrom(req.headers);

  if (!isValidEmail(email) || !password) {
    return apiError('Email and password are required.', 'MISSING_CREDENTIALS', 400);
  }

  // Rate-limit by email: max 10 attempts / 5 minutes.
  const allowed = await checkRateLimit(`login:${email.toLowerCase()}`, 10, 300);
  if (!allowed) {
    return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);
  }

  const user = await findUserByEmail(email);
  // Only patient accounts log in here; hospital staff and developers use their
  // dedicated portals.
  const isPatient = user?.account_type === 'patient';
  const ok = user && isPatient ? await verifyPassword(password, user.password_hash) : false;

  if (!user || !isPatient || !ok || !user.is_active) {
    await logAudit({ userId: user?.id ?? null, action: 'login_failed', details: { email }, ip });
    // Generic message — don't reveal whether the email exists.
    return apiError('Invalid email or password.', 'INVALID_CREDENTIALS', 401);
  }

  const { token, expiresAt } = await createSession(user.id, 'patient');
  cookies().set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  await query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);
  await logAudit({
    userId: user.id,
    action: 'login',
    resourceType: 'user',
    resourceId: user.id,
    ip,
  });

  return apiOk({ success: true, user_id: user.id });
}
