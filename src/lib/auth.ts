import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/lib/db';
import type { AccountType, PublicUser, User } from '@/types';

// Re-export the pure validators so existing server imports keep working. Client
// components should import these from '@/lib/validation' to avoid pulling in pg.
export { isValidEmail, validatePasswordStrength } from '@/lib/validation';

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const SESSION_COOKIE = 'racoon_session';
export const HOSPITAL_SESSION_COOKIE = 'racoon_hospital_session';
export const DEV_SESSION_COOKIE = 'racoon_dev_session';

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

/** Cryptographically-random raw token (goes in the cookie, never stored raw). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 hash stored in the DB so a DB leak doesn't expose live tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface SessionRecord {
  user_id: string;
  account_type: AccountType;
  expires_at: string;
}

/** Create a session row and return the raw token to set in a cookie. */
export async function createSession(
  userId: string,
  accountType: AccountType,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query(
    `INSERT INTO sessions (user_id, token_hash, account_type, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, accountType, expiresAt],
  );
  return { token, expiresAt };
}

/** Look up a live session by raw token; returns null if missing/expired. */
export async function getSession(token: string | undefined): Promise<SessionRecord | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = await queryOne<SessionRecord>(
    `SELECT user_id, account_type, expires_at
     FROM sessions
     WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash],
  );
  return row;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

export function toPublicUser(user: User): PublicUser {
  const { password_hash: _omit, ...rest } = user;
  return rest;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);
}

export async function findUserById(id: string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    expires: expiresAt,
  };
}

/**
 * Resolve the current patient session from the request cookies.
 * Returns the session record or null.
 */
export async function getPatientSession(
  cookieGet: (name: string) => string | undefined,
): Promise<SessionRecord | null> {
  const session = await getSession(cookieGet(SESSION_COOKIE));
  if (!session || session.account_type !== 'patient') return null;
  return session;
}

// ---------------------------------------------------------------------------
// Rate limiting (DB-backed sliding window)
// ---------------------------------------------------------------------------

/**
 * Returns true if the action is allowed (under the limit), false if throttled.
 * Records the attempt when allowed.
 */
export async function checkRateLimit(
  bucketKey: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<boolean> {
  const { rows } = await query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM rate_limit_events
     WHERE bucket_key = $1 AND created_at > now() - ($2 || ' seconds')::interval`,
    [bucketKey, String(windowSeconds)],
  );
  const count = Number(rows[0]?.count ?? '0');
  if (count >= maxAttempts) return false;
  await query('INSERT INTO rate_limit_events (bucket_key) VALUES ($1)', [bucketKey]);
  return true;
}
