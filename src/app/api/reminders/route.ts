import { cookies } from 'next/headers';
import { query, queryOne } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getPatientSession, checkRateLimit } from '@/lib/auth';
import { sanitizeText } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';

/**
 * Patient-personal calendar reminders (founder ask, not a numbered worklist
 * item). Strictly owner-scoped like /api/biodata/me — the session already
 * proves ownership, so every query filters by the caller's own user_id.
 *
 * Scope decision: storage + display only. No push/email delivery, no
 * background scheduler — this project has no job-scheduling infrastructure,
 * and building one is out of scope for "let users set reminders on
 * calendar" (see migrations/017_reminders.sql for the full rationale).
 */

async function requireOwner() {
  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);
  return session?.user_id ?? null;
}

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  note: string | null;
  remind_at: string;
  created_at: string;
}

/** A single account can accumulate reminders indefinitely over normal use;
 * this cap only exists to bound abuse (e.g. a scripted flood), not to
 * constrain real usage — same spirit as sanitizeClinicalConditions'/
 * sanitizeDepartments' per-user JSON caps, just sized for a table that's
 * meant to grow over years of calendar use rather than a biodata form. */
const MAX_REMINDERS_PER_USER = 500;
const MAX_TITLE_LEN = 200;
const MAX_NOTE_LEN = 2000;

/** GET — list every reminder the caller owns, soonest first. */
export async function GET(req: Request) {
  const userId = await requireOwner();
  if (!userId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const { rows } = await query<Reminder>(
    `SELECT id, user_id, title, note, remind_at, created_at
     FROM reminders
     WHERE user_id = $1
     ORDER BY remind_at ASC`,
    [userId],
  );

  return apiOk({ reminders: rows });
}

interface CreateBody {
  title?: string;
  note?: string;
  remind_at?: string;
}

/** POST — create a reminder for the caller's own calendar. */
export async function POST(req: Request) {
  const userId = await requireOwner();
  if (!userId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const allowed = await checkRateLimit(`reminder_create:${userId}`, 30, 3600);
  if (!allowed) return apiError('Too many reminders created. Try again later.', 'RATE_LIMITED', 429);

  const body = await readJson<CreateBody>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const title = sanitizeText(body.title, MAX_TITLE_LEN);
  if (!title || !title.trim()) return apiError('A title is required.', 'BAD_REQUEST', 400);

  const note =
    body.note === undefined || body.note === null || body.note === ''
      ? null
      : sanitizeText(body.note, MAX_NOTE_LEN);

  if (typeof body.remind_at !== 'string' || Number.isNaN(Date.parse(body.remind_at))) {
    return apiError('A valid remind_at date/time is required.', 'BAD_REQUEST', 400);
  }
  const remindAt = new Date(body.remind_at).toISOString();

  const countRow = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM reminders WHERE user_id = $1`,
    [userId],
  );
  if (Number(countRow?.count ?? '0') >= MAX_REMINDERS_PER_USER) {
    return apiError('Reminder limit reached. Delete an old reminder first.', 'LIMIT_REACHED', 400);
  }

  const { rows } = await query<{ id: string; created_at: string }>(
    `INSERT INTO reminders (user_id, title, note, remind_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [userId, title, note, remindAt],
  );
  const row = rows[0]!;

  await logAudit({
    userId,
    action: 'reminder_change',
    resourceType: 'reminder',
    resourceId: row.id,
    details: { op: 'create' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk(
    {
      reminder: {
        id: row.id,
        user_id: userId,
        title,
        note,
        remind_at: remindAt,
        created_at: row.created_at,
      } satisfies Reminder,
    },
    201,
  );
}
