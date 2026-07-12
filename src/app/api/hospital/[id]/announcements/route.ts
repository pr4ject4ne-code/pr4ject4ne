import { query, withTransaction } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { requireHospitalOwnership } from '@/lib/hospital-auth';
import { sanitizeText } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';
import type { AnnouncementColor } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLORS: AnnouncementColor[] = ['green', 'yellow', 'red'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** true when the value is absent/empty (allowed) or a valid YYYY-MM-DD date. */
function isValidEventDate(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true;
  return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
}

interface CreateBody {
  title?: string;
  body?: string;
  color?: string;
  event_date?: string | null;
  is_bar?: boolean;
}

/** POST — create an announcement (own hospital only). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!UUID_RE.test((await params).id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership((await params).id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<CreateBody>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const title = sanitizeText(body.title, 300);
  if (!title || !title.trim()) return apiError('Title is required.', 'MISSING_TITLE', 400);
  if (!isValidEventDate(body.event_date)) {
    return apiError('event_date must be a valid YYYY-MM-DD date.', 'INVALID_DATE', 400);
  }
  const color = COLORS.includes(body.color as AnnouncementColor)
    ? (body.color as AnnouncementColor)
    : 'green';
  const text = sanitizeText(body.body, 4000);
  const eventDate = typeof body.event_date === 'string' && body.event_date ? body.event_date : null;
  const isBar = body.is_bar === true;

  const id = await withTransaction(async (tx) => {
    // Only one bar announcement per hospital.
    if (isBar) {
      await tx.query(`UPDATE announcements SET is_bar = FALSE WHERE hospital_id = $1`, [(await params).id]);
    }
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO announcements (hospital_id, title, body, color, event_date, is_bar)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [(await params).id, title, text, color, eventDate, isBar],
    );
    return rows[0]!.id;
  });

  await logAudit({
    userId: staff.userId,
    action: 'announcement_change',
    resourceType: 'announcement',
    resourceId: id,
    details: { op: 'create', color, is_bar: isBar },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, id }, 201);
}

interface PatchBody extends CreateBody {
  id?: string;
}

/** PATCH — edit an announcement (own hospital only). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!UUID_RE.test((await params).id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership((await params).id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<PatchBody>(req);
  if (!body || !body.id || !UUID_RE.test(body.id)) return apiError('Invalid request.', 'BAD_REQUEST', 400);
  if (!isValidEventDate(body.event_date)) {
    return apiError('event_date must be a valid YYYY-MM-DD date.', 'INVALID_DATE', 400);
  }

  // Confirm the announcement belongs to this hospital (isolation).
  const { rows: owned } = await query<{ id: string }>(
    `SELECT id FROM announcements WHERE id = $1 AND hospital_id = $2`,
    [body.id, (await params).id],
  );
  if (owned.length === 0) return apiError('Not found.', 'NOT_FOUND', 404);

  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };
  if (typeof body.title === 'string') {
    const t = sanitizeText(body.title, 300);
    if (t && t.trim()) push('title', t);
  }
  if ('body' in body) push('body', sanitizeText(body.body, 4000));
  if (COLORS.includes(body.color as AnnouncementColor)) push('color', body.color);
  if ('event_date' in body) push('event_date', body.event_date || null);

  if (body.is_bar === false) push('is_bar', false);
  // A bar toggle to true is applied inside the transaction below (it also clears
  // any other bar), but count it here so an is_bar-only edit isn't rejected.
  const willWrite = sets.length > 0 || body.is_bar === true;
  if (!willWrite) return apiError('Nothing to update.', 'BAD_REQUEST', 400);

  await withTransaction(async (tx) => {
    if (body.is_bar === true) {
      await tx.query(`UPDATE announcements SET is_bar = FALSE WHERE hospital_id = $1`, [(await params).id]);
      push('is_bar', true);
    }
    if (sets.length > 0) {
      values.push(body.id);
      await tx.query(
        `UPDATE announcements SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
        values,
      );
    }
  });

  await logAudit({
    userId: staff.userId,
    action: 'announcement_change',
    resourceType: 'announcement',
    resourceId: body.id,
    details: { op: 'edit' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}

/** DELETE — remove an announcement (own hospital only). Pass ?announcement_id=. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!UUID_RE.test((await params).id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership((await params).id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const annId = new URL(req.url).searchParams.get('announcement_id');
  if (!annId || !UUID_RE.test(annId)) return apiError('Invalid request.', 'BAD_REQUEST', 400);

  const { rowCount } = await query(
    `DELETE FROM announcements WHERE id = $1 AND hospital_id = $2`,
    [annId, (await params).id],
  );
  if (!rowCount) return apiError('Not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId: staff.userId,
    action: 'announcement_change',
    resourceType: 'announcement',
    resourceId: annId,
    details: { op: 'delete' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}
