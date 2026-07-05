import { getDevUser, isAdmin } from '@/lib/dev-auth';
import { apiError, apiOk } from '@/lib/api';

/** Returns the current developer (for portal hydration). */
export async function GET() {
  const user = await getDevUser();
  if (!user) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);
  return apiOk({
    authenticated: true,
    dev: {
      id: user.id,
      email: user.email,
      access_level: user.access_level,
      is_admin: isAdmin(user),
    },
  });
}
