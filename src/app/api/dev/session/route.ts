import { getDevUser, isPrimary, isSecondary } from '@/lib/dev-auth';
import { apiError, apiOk } from '@/lib/api';

/** Returns the current developer + level capabilities (for portal hydration). */
export async function GET() {
  const user = await getDevUser();
  if (!user) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);
  return apiOk({
    authenticated: true,
    dev: {
      id: user.id,
      email: user.email,
      access_level: user.access_level,
      is_primary: isPrimary(user),
      is_secondary: isSecondary(user),
      // Back-compat for any client still reading is_admin.
      is_admin: isPrimary(user),
      totp_enabled: user.totp_enabled,
    },
  });
}
