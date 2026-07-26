import { query, queryOne } from '@/lib/db';
import { apiError, apiOk, readJson, parseLimit, parseOffset } from '@/lib/api';
import { getDevUser } from '@/lib/dev-auth';
import { sanitizeText, escapeLikePattern } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';
import type { ConsentStatus } from '@/types';

/**
 * Doctor consent records CRUD (worklist #30) — the admin-recorded process a
 * developer (primary OR secondary, same "any dev" gate as /api/dev/tertiary
 * and /api/dev/first-aid) uses to log the outcome of contacting a doctor
 * out-of-band (phone/email, outside this app) about whether they consent to
 * their name/contact being attributed in a generated report.
 *
 * A doctor with no row at all is implicitly not-consented (migration 014) —
 * this route never creates a row on a doctor's behalf without an explicit
 * developer action.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: ConsentStatus[] = ['pending', 'approved', 'denied'];

/**
 * GET — search doctors (by name or hospital name, reusing the ILIKE +
 * escapeLikePattern pattern already used by DoctorRoster's data source) with
 * each doctor's MOST RECENT consent record folded in (or null fields if none
 * exists). Any developer.
 */
export async function GET(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = parseLimit(url.searchParams.get('limit'), 25, 100);
  const offset = parseOffset(url.searchParams.get('offset'));

  const params: unknown[] = [];
  let where = '';
  if (q) {
    params.push(`%${escapeLikePattern(q)}%`);
    where = `WHERE (d.name ILIKE $${params.length} ESCAPE '\\' OR h.name ILIKE $${params.length} ESCAPE '\\')`;
  }

  const totalRow = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM doctors d JOIN hospitals h ON h.id = d.hospital_id ${where}`,
    params,
  );
  const total = Number(totalRow.rows[0]?.count ?? '0');

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT d.id, d.name, d.specialty, d.contact_phone, d.contact_email,
            h.id AS hospital_id, h.name AS hospital_name,
            c.id AS consent_id, c.consent_status, c.contacted_via, c.denial_reason,
            c.decided_at, c.created_at AS consent_recorded_at
     FROM doctors d
     JOIN hospitals h ON h.id = d.hospital_id
     LEFT JOIN LATERAL (
       SELECT * FROM doctor_consent_records r
       WHERE r.doctor_id = d.id
       ORDER BY r.created_at DESC
       LIMIT 1
     ) c ON true
     ${where}
     ORDER BY d.name ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return apiOk({ doctors: rows, total, limit, offset });
}

interface CreateBody {
  doctor_id?: string;
  consent_status?: string;
  contacted_via?: string;
  denial_reason?: string;
}

/**
 * POST — record the outcome of a NEW contact attempt with a doctor (a fresh
 * row, not an in-place mutation of history — see migration 014's "current
 * status = most recent row" design). Any developer.
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<CreateBody>(req);
  if (!body || !body.doctor_id || !UUID_RE.test(body.doctor_id)) {
    return apiError('A valid doctor_id is required.', 'BAD_REQUEST', 400);
  }
  if (!body.consent_status || !STATUSES.includes(body.consent_status as ConsentStatus)) {
    return apiError('consent_status must be pending, approved, or denied.', 'BAD_REQUEST', 400);
  }

  const doctor = await queryOne<{ id: string }>('SELECT id FROM doctors WHERE id = $1', [body.doctor_id]);
  if (!doctor) return apiError('Doctor not found.', 'NOT_FOUND', 404);

  const consentStatus = body.consent_status as ConsentStatus;
  const contactedVia = sanitizeText(body.contacted_via, 200);
  const denialReason = consentStatus === 'denied' ? sanitizeText(body.denial_reason, 2000) : null;
  const decided = consentStatus !== 'pending';

  const { rows } = await query<{ id: string }>(
    `INSERT INTO doctor_consent_records
       (doctor_id, consent_status, contacted_via, denial_reason, recorded_by_dev_id, decided_at)
     VALUES ($1, $2, $3, $4, $5, ${decided ? 'now()' : 'NULL'})
     RETURNING id`,
    [body.doctor_id, consentStatus, contactedVia, denialReason, dev.id],
  );
  const id = rows[0]!.id;

  await logAudit({
    userId: dev.id,
    action: 'doctor_consent_recorded',
    resourceType: 'doctor',
    resourceId: body.doctor_id,
    details: { record_id: id, consent_status: consentStatus },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, id }, 201);
}

interface PatchBody {
  id?: string;
  consent_status?: string;
  contacted_via?: string;
  denial_reason?: string;
}

/** PATCH — update an existing consent record's outcome. Any developer. */
export async function PATCH(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<PatchBody>(req);
  if (!body || !body.id || !UUID_RE.test(body.id)) {
    return apiError('Invalid request.', 'BAD_REQUEST', 400);
  }
  if (!body.consent_status || !STATUSES.includes(body.consent_status as ConsentStatus)) {
    return apiError('consent_status must be pending, approved, or denied.', 'BAD_REQUEST', 400);
  }

  const existing = await queryOne<{ doctor_id: string }>(
    'SELECT doctor_id FROM doctor_consent_records WHERE id = $1',
    [body.id],
  );
  if (!existing) return apiError('Consent record not found.', 'NOT_FOUND', 404);

  const consentStatus = body.consent_status as ConsentStatus;
  const contactedVia = sanitizeText(body.contacted_via, 200);
  const denialReason = consentStatus === 'denied' ? sanitizeText(body.denial_reason, 2000) : null;
  const decided = consentStatus !== 'pending';

  await query(
    `UPDATE doctor_consent_records
     SET consent_status = $2, contacted_via = COALESCE($3, contacted_via), denial_reason = $4,
         decided_at = ${decided ? 'now()' : 'NULL'}
     WHERE id = $1`,
    [body.id, consentStatus, contactedVia, denialReason],
  );

  await logAudit({
    userId: dev.id,
    action: 'doctor_consent_updated',
    resourceType: 'doctor',
    resourceId: existing.doctor_id,
    details: { record_id: body.id, consent_status: consentStatus },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}
