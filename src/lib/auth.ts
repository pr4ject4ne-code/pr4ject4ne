import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, queryOne, withTransaction } from '@/lib/db';
import type { AccountType, PublicUser, User } from '@/types';

// Re-export the pure validators so existing server imports keep working. Client
// components should import these from '@/lib/validation' to avoid pulling in pg.
export { isValidEmail, validatePasswordStrength } from '@/lib/validation';

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
/** Sliding expiry: extend only when the session is within this window of expiring. */
const SESSION_RENEW_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
/** Absolute cap: a session never lives more than this past its creation. */
const SESSION_ABSOLUTE_MAX_MS = 12 * 60 * 60 * 1000; // 12 hours
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

/**
 * A valid cost-12 bcrypt hash of a throwaway string. Login handlers compare the
 * supplied password against THIS when no real account matches, so an unknown
 * email costs the same ~250ms bcrypt as a real one — closing the timing side
 * channel that would otherwise reveal which emails are registered. Not a secret.
 */
export const DUMMY_PASSWORD_HASH =
  '$2a$12$YJny8LsD5qxiSH5.aE2OYeRvdRdTEJEYWzObazjg48Cjl6PUUhUyO';

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
  created_at: string;
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

/**
 * Look up a live session by raw token; returns null if missing/expired.
 *
 * Sliding expiry: when a valid session is within SESSION_RENEW_THRESHOLD_MS of
 * expiring, extend it by SESSION_TTL_MS — threshold-gated so this is NOT a DB
 * write on every request. Extension is hard-capped: expires_at never goes past
 * created_at + SESSION_ABSOLUTE_MAX_MS, so a stolen cookie can't be kept alive
 * forever.
 */
export async function getSession(token: string | undefined): Promise<SessionRecord | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = await queryOne<SessionRecord>(
    `SELECT user_id, account_type, expires_at, created_at
     FROM sessions
     WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash],
  );
  if (!row) return null;

  const now = Date.now();
  const expiresAtMs = new Date(row.expires_at).getTime();
  if (Number.isFinite(expiresAtMs) && expiresAtMs - now < SESSION_RENEW_THRESHOLD_MS) {
    const createdAtMs = new Date(row.created_at).getTime();
    const capMs = createdAtMs + SESSION_ABSOLUTE_MAX_MS;
    const nextExpiryMs = Math.min(now + SESSION_TTL_MS, capMs);
    if (nextExpiryMs > expiresAtMs) {
      // LEAST() re-applies the cap in SQL so DB time (not app time) is
      // authoritative; the guard above just avoids no-op writes.
      await query(
        `UPDATE sessions
         SET expires_at = LEAST(now() + interval '30 minutes', created_at + interval '12 hours')
         WHERE token_hash = $1 AND expires_at > now()`,
        [tokenHash],
      );
      row.expires_at = new Date(nextExpiryMs).toISOString();
    }
  }
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
 *
 * Re-loads the user and checks it still exists, is a patient, and is active —
 * mirroring getDevUser/getHospitalStaff — so a deactivated or deleted patient
 * can't keep acting on a still-valid session cookie.
 */
export async function getPatientSession(
  cookieGet: (name: string) => string | undefined,
): Promise<SessionRecord | null> {
  const session = await getSession(cookieGet(SESSION_COOKIE));
  if (!session || session.account_type !== 'patient') return null;
  const user = await findUserById(session.user_id);
  if (!user || user.account_type !== 'patient' || !user.is_active) return null;
  return session;
}

// ---------------------------------------------------------------------------
// Rate limiting (DB-backed sliding window)
// ---------------------------------------------------------------------------

/** Rows older than this are swept globally regardless of bucket (see below). */
const RATE_LIMIT_MAX_AGE_SECONDS = 24 * 60 * 60; // 1 day
/** Probability of running the global sweep on any given allowed call. */
const RATE_LIMIT_SWEEP_PROBABILITY = 0.02;

/**
 * Returns true if the action is allowed (under the limit), false if throttled.
 *
 * The count + insert run inside a transaction guarded by a per-bucket advisory
 * lock (`pg_advisory_xact_lock`), so concurrent requests for the same bucket are
 * serialized. Without this, a burst of concurrent logins could all read the same
 * pre-increment count and all pass the gate (check-then-act race), defeating the
 * brute-force limit. The lock is keyed on the bucket, so unrelated buckets never
 * contend.
 *
 * Cleanup is two-tiered so rate_limit_events can't grow forever: a per-bucket
 * prune drops rows aged out of *this* bucket's window, and a probabilistic global
 * sweep drops any row older than RATE_LIMIT_MAX_AGE_SECONDS across all buckets —
 * the latter matters for one-shot buckets (e.g. login:<unique-email>) that are
 * never revisited and so would never be pruned by the per-bucket path alone.
 */
export async function checkRateLimit(
  bucketKey: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<boolean> {
  return withTransaction(async (tx) => {
    // Serialize concurrent callers for this bucket. hashtextextended → bigint key
    // for the advisory lock; released automatically at transaction end.
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [bucketKey]);

    const { rows } = await tx.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM rate_limit_events
       WHERE bucket_key = $1 AND created_at > now() - ($2 || ' seconds')::interval`,
      [bucketKey, String(windowSeconds)],
    );
    const count = Number(rows[0]?.count ?? '0');
    if (count >= maxAttempts) return false;

    await tx.query('INSERT INTO rate_limit_events (bucket_key) VALUES ($1)', [bucketKey]);
    // Per-bucket prune: rows older than this bucket's window can never count again.
    await tx.query(
      `DELETE FROM rate_limit_events
       WHERE bucket_key = $1 AND created_at <= now() - ($2 || ' seconds')::interval`,
      [bucketKey, String(windowSeconds)],
    );
    // Amortized global GC for buckets that are never revisited.
    if (Math.random() < RATE_LIMIT_SWEEP_PROBABILITY) {
      await tx.query(
        `DELETE FROM rate_limit_events
         WHERE created_at < now() - ($1 || ' seconds')::interval`,
        [String(RATE_LIMIT_MAX_AGE_SECONDS)],
      );
    }
    return true;
  });
}
