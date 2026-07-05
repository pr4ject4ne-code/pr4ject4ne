import { cookies } from 'next/headers';
import {
  getSession,
  createSession,
  destroySession,
  DEV_SESSION_COOKIE,
  type SessionRecord,
} from '@/lib/auth';
import { findUserById } from '@/lib/auth';
import type { User } from '@/types';

/**
 * Developer session helpers — a SEPARATE session from patient/hospital auth,
 * stored in its own cookie (DEV_SESSION_COOKIE). Developer accounts live in the
 * users table with account_type = 'developer'. Credentials are provisioned via
 * the primary-dev page, never hardcoded.
 */

export { DEV_SESSION_COOKIE, createSession as createDevSessionRecord };

export async function getDevSession(): Promise<SessionRecord | null> {
  const token = cookies().get(DEV_SESSION_COOKIE)?.value;
  const session = await getSession(token);
  if (!session || session.account_type !== 'developer') return null;
  return session;
}

/** Resolve the current developer user, or null. */
export async function getDevUser(): Promise<User | null> {
  const session = await getDevSession();
  if (!session) return null;
  const user = await findUserById(session.user_id);
  if (!user || user.account_type !== 'developer' || !user.is_active) return null;
  return user;
}

/** True when the developer has admin (primary-dev) access. */
export function isAdmin(user: User): boolean {
  return user.access_level === 'admin';
}

export async function destroyDevSession(): Promise<void> {
  const token = cookies().get(DEV_SESSION_COOKIE)?.value;
  await destroySession(token);
  cookies().delete(DEV_SESSION_COOKIE);
}
