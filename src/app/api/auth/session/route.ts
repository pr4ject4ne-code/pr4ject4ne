import { cookies } from 'next/headers';
import { getSession, findUserById, toPublicUser, SESSION_COOKIE } from '@/lib/auth';
import { apiError, apiOk } from '@/lib/api';

/** Returns the current patient session's user (for middleware/verify + dashboard hydration). */
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await getSession(token);
  if (!session || session.account_type !== 'patient') {
    return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);
  }
  const user = await findUserById(session.user_id);
  if (!user || !user.is_active) {
    return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);
  }
  return apiOk({ authenticated: true, user: toPublicUser(user) });
}
