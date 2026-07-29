import { cookies } from 'next/headers';
import { queryOne, query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getPatientSession, findUserById, verifyPassword, checkRateLimit } from '@/lib/auth';
import { generateIhnCode } from '@/lib/ihn-code';
import { logAudit, clientIpFrom } from '@/lib/audit';

/**
 * Regenerate the caller's own IHN code (founder ask, 2026-07-29 — a
 * deliberate reversal of the code's original "static, never rotates"
 * design; see migrations/018_ihn_code_regenerate.sql). Gated on:
 *  - the caller's current password (proves it's really them, not just
 *    whoever is holding an already-open session)
 *  - a 30-day cooldown since the last regeneration (or since account
 *    creation, if it's never been regenerated) — a rotation this
 *    consequential (every relative/first-responder holding the old code
 *    loses access) shouldn't be triggerable casually or repeatedly.
 */

const COOLDOWN_DAYS = 30;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const MAX_GENERATE_ATTEMPTS = 5;

interface Body {
  current_password?: string;
}

export async function POST(req: Request) {
  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);
  if (!session) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);
  const userId = session.user_id;

  const allowed = await checkRateLimit(`ihn_regenerate:${userId}`, 5, 3600);
  if (!allowed) return apiError('Too many attempts. Try again later.', 'RATE_LIMITED', 429);

  const body = await readJson<Body>(req);
  const currentPassword = typeof body?.current_password === 'string' ? body.current_password : '';

  const user = await findUserById(userId);
  if (!user || !user.is_active) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const passwordOk = await verifyPassword(currentPassword, user.password_hash);
  if (!passwordOk) return apiError('Current password is incorrect.', 'INVALID_CREDENTIALS', 401);

  // The cooldown check and the write happen in the SAME statement (WHERE
  // clause), not a separate SELECT-then-UPDATE — a plain read-then-write here
  // would let several concurrent requests all read the same pre-update
  // timestamp, all pass the check, and all write independently (a TOCTOU
  // race; caught in security review). `rowCount === 0` on this UPDATE means
  // either the row doesn't exist or the cooldown is still active; only then
  // do we run a cheap follow-up SELECT to tell those two cases apart for the
  // error message.
  let newCode: string | null = null;
  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS && !newCode; attempt += 1) {
    const candidate = generateIhnCode();
    try {
      const result = await query(
        `UPDATE biodata
         SET ihn_code = $2, ihn_code_regenerated_at = now()
         WHERE user_id = $1
           AND now() - COALESCE(ihn_code_regenerated_at, created_at) >= interval '${COOLDOWN_DAYS} days'`,
        [userId, candidate],
      );
      if (result.rowCount) {
        newCode = candidate;
      } else {
        const record = await queryOne<{ ihn_code_regenerated_at: string | null; created_at: string }>(
          `SELECT ihn_code_regenerated_at, created_at FROM biodata WHERE user_id = $1`,
          [userId],
        );
        if (!record) return apiError('Biodata not found.', 'NOT_FOUND', 404);
        const lastRotated = new Date(record.ihn_code_regenerated_at ?? record.created_at).getTime();
        const daysLeft = Math.ceil((COOLDOWN_MS - (Date.now() - lastRotated)) / (24 * 60 * 60 * 1000));
        return apiError(
          `You can regenerate your IHN code again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
          'COOLDOWN_ACTIVE',
          429,
        );
      }
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('duplicate key')) throw err;
      // Collision on this candidate — loop and try another.
    }
  }
  if (!newCode) return apiError('Could not generate a new code. Please try again.', 'SERVER_ERROR', 500);

  await logAudit({
    userId,
    action: 'ihn_code_regenerate',
    resourceType: 'biodata',
    resourceId: userId,
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ ihn_code: newCode });
}
