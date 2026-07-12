import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import {
  getSession,
  findUserById,
  verifyPassword,
  hashPassword,
  hashToken,
  validatePasswordStrength,
  SESSION_COOKIE,
  DEV_SESSION_COOKIE,
  HOSPITAL_SESSION_COOKIE,
} from '@/lib/auth';
import { logAudit, clientIpFrom } from '@/lib/audit';

interface Body {
  current_password?: string;
  new_password?: string;
}

const COOKIES = [DEV_SESSION_COOKIE, HOSPITAL_SESSION_COOKIE, SESSION_COOKIE];

/**
 * PATCH — change the signed-in account's own password. Works for any account
 * type (patient, developer, hospital_staff) — the "edit password in the dev page"
 * capability. Email is never editable here. Requires the current password, sets
 * a policy-compliant new one, and invalidates all OTHER sessions (keeps the
 * caller's current one).
 */
export async function PATCH(req: Request) {
  const store = await cookies();
  let token: string | undefined;
  let userId: string | undefined;
  for (const name of COOKIES) {
    const t = store.get(name)?.value;
    if (!t) continue;
    const session = await getSession(t);
    if (session) {
      token = t;
      userId = session.user_id;
      break;
    }
  }
  if (!token || !userId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const user = await findUserById(userId);
  if (!user || !user.is_active) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const body = await readJson<Body>(req);
  const currentPassword = typeof body?.current_password === 'string' ? body.current_password : '';
  const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';

  const currentOk = await verifyPassword(currentPassword, user.password_hash);
  if (!currentOk) return apiError('Current password is incorrect.', 'INVALID_CREDENTIALS', 401);

  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) return apiError(strength.reason!, 'WEAK_PASSWORD', 400);

  const passwordHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
    user.id,
    passwordHash,
  ]);
  // Invalidate every other session for this user; keep the caller's current one.
  await query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [
    user.id,
    hashToken(token),
  ]);

  await logAudit({
    userId: user.id,
    action: 'password_change',
    resourceType: user.account_type,
    resourceId: user.id,
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}
