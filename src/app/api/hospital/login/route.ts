import { cookies } from 'next/headers';
import {
  verifyPassword,
  createSession,
  sessionCookieOptions,
  HOSPITAL_SESSION_COOKIE,
  findUserByEmail,
  checkRateLimit,
} from '@/lib/auth';
import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { isValidEmail } from '@/lib/validation';
import { logAudit, clientIpFrom } from '@/lib/audit';

interface Body {
  email?: string;
  password?: string;
}

/** Hospital staff login — separate session cookie, rate-limited (5 / 5 min). */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = clientIpFrom(req.headers);

  if (!isValidEmail(email) || !password) {
    return apiError('Email and password are required.', 'MISSING_CREDENTIALS', 400);
  }

  const allowed = await checkRateLimit(`hospital_login:${email.toLowerCase()}`, 5, 300);
  if (!allowed) return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);

  const user = await findUserByEmail(email);
  const isStaff = user?.account_type === 'hospital_staff';
  const ok = user && isStaff ? await verifyPassword(password, user.password_hash) : false;

  if (!user || !isStaff || !ok || !user.is_active || !user.hospital_id) {
    await logAudit({ userId: user?.id ?? null, action: 'login_failed', details: { portal: 'hospital', email }, ip });
    return apiError('Invalid email or password.', 'INVALID_CREDENTIALS', 401);
  }

  const { token, expiresAt } = await createSession(user.id, 'hospital_staff');
  cookies().set(HOSPITAL_SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  await query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);
  await logAudit({
    userId: user.id,
    action: 'login',
    resourceType: 'hospital',
    resourceId: user.hospital_id,
    ip,
  });

  return apiOk({ success: true, hospital_id: user.hospital_id });
}
