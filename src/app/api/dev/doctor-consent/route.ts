import { query, queryOne } from '@/lib/db';
import { apiError, apiOk, readJson, parseLimit, parseOffset } from '@/lib/api';
import { getDevUser, isPrimary } from '@/lib/dev-auth';
import { sanitizeText, escapeLikePattern } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';
import type { ConsentStatus } from '@/types';

/**
 * Doctor consent records CRUD (worklist #30) — the admin-recorded process a
 * developer uses to log the outcome of contacting a doctor out-of-band
 * (phone/email, outside this app) about whether they consent to their
 * name/contact being attributed in a generated report.
 *
 * SCOPED TO A (doctor, patient) PAIR (migration 016 — fixes a real
 * fabricated-attribution vulnerability): a doctor's consent is recorded
 * specifically for ONE patient's record, never as a blanket "this doctor
 * consents, period". A patient must be identified the same way a doctor is
 * (search + select) before a consent outcome can be recorded.
 *
 * PRIMARY-ONLY (security finding, was "any developer"): recording a doctor's
 * consent has real-world liability for a named third party — the same bar
 * `/api/dev/accounts` uses for its higher-stakes actions (mirrors
 * `isPrimary` gate exactly).
 *
 * APPEND-ONLY (security finding, was mutable via PATCH): there is no PATCH
 * here anymore. A correction is a NEW row (a fresh contact attempt/status
 * change), never an in-place mutation of history — matching migration 014's
 * own documented "most recent row wins... never by mutating history in
 * place" design, which a PATCH endpoint directly contradicted.
 *
 * A doctor+patient pair with no row at all is implicitly not-consented
 * (migration 014) — this route never creates a row on a doctor's behalf
 * without an explicit developer action.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: ConsentStatus[] = ['pending', 'approved', 'denied'];

/**
 * GET — two resources, selected via `?resource=`:
 *  - `doctors` (default) — search doctors by name/hospital name (ILIKE, same
 *    pattern as before). When a valid `patient_user_id` is also supplied, each
 *    doctor's MOST RECENT consent record is folded in SCOPED TO THAT PATIENT
 *    (or null fields if no row exists for this exact pair). Without a
 *    `patient_user_id`, consent columns are always null — a per-doctor status
 *    is no longer a meaningful thing to show.
 *  - `patients` — search patient accounts by email (ILIKE, same
 *    escapeLikePattern pattern as the doctor search) so a developer can
 *    identify the target patient before selecting a doctor. Only
 *    `account_type = 'patient'` rows are ever returned.
 * Primary only.
 */
export async function GET(req: Request) {
  const dev = await getDevUser();
  if (!dev || !isPrimary(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const url = new URL(req.url);
  const resource = url.searchParams.get('resource') === 'patients' ? 'patients' : 'doctors';
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = parseLimit(url.searchParams.get('limit'), 25, 100);
  const offset = parseOffset(url.searchParams.get('offset'));

  if (resource === 'patients') {
    const params: unknown[] = [];
    let where = `WHERE account_type = 'patient'`;
    if (q) {
      params.push(`%${escapeLikePattern(q)}%`);
      where += ` AND email ILIKE $${params.length} ESCAPE '\\'`;
    }

    const totalRow = await query<{ count: string }>(`SELECT count(*)::text AS count FROM users ${where}`, params);
    const total = Number(totalRow.rows[0]?.count ?? '0');

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT id, email, created_at FROM users ${where}
       ORDER BY email ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return apiOk({ patients: rows, total, limit, offset });
  }

  const patientParam = url.searchParams.get('patient_user_id');
  const patientUserId = patientParam && UUID_RE.test(patientParam) ? patientParam : null;

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

  let consentSelect =
    'NULL::uuid AS consent_id, NULL::text AS consent_status, NULL::text AS contacted_via, ' +
    'NULL::text AS denial_reason, NULL::timestamptz AS decided_at, NULL::timestamptz AS consent_recorded_at';
  let consentJoin = '';
  if (patientUserId) {
    params.push(patientUserId);
    const patientIdx = params.length;
    consentSelect =
      'c.id AS consent_id, c.consent_status, c.contacted_via, c.denial_reason, c.decided_at, ' +
      'c.created_at AS consent_recorded_at';
    consentJoin = `LEFT JOIN LATERAL (
       SELECT * FROM doctor_consent_records r
       WHERE r.doctor_id = d.id AND r.patient_user_id = $${patientIdx}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 1
     ) c ON true`;
  }

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT d.id, d.name, d.specialty, d.contact_phone, d.contact_email,
            h.id AS hospital_id, h.name AS hospital_name,
            ${consentSelect}
     FROM doctors d
     JOIN hospitals h ON h.id = d.hospital_id
     ${consentJoin}
     ${where}
     ORDER BY d.name ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return apiOk({ doctors: rows, total, limit, offset, patient_user_id: patientUserId });
}

interface CreateBody {
  doctor_id?: string;
  patient_user_id?: string;
  consent_status?: string;
  contacted_via?: string;
  denial_reason?: string;
}

/**
 * POST — record the outcome of a NEW contact attempt with a doctor, scoped to
 * one specific patient's record (a fresh row, never an in-place mutation of
 * history — see migration 014's "most recent row wins" design). Primary only.
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  if (!dev || !isPrimary(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<CreateBody>(req);
  if (!body || !body.doctor_id || !UUID_RE.test(body.doctor_id)) {
    return apiError('A valid doctor_id is required.', 'BAD_REQUEST', 400);
  }
  if (!body.patient_user_id || !UUID_RE.test(body.patient_user_id)) {
    return apiError('A valid patient_user_id is required.', 'BAD_REQUEST', 400);
  }
  if (!body.consent_status || !STATUSES.includes(body.consent_status as ConsentStatus)) {
    return apiError('consent_status must be pending, approved, or denied.', 'BAD_REQUEST', 400);
  }

  const doctor = await queryOne<{ id: string }>('SELECT id FROM doctors WHERE id = $1', [body.doctor_id]);
  if (!doctor) return apiError('Doctor not found.', 'NOT_FOUND', 404);

  const patient = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND account_type = 'patient'`,
    [body.patient_user_id],
  );
  if (!patient) return apiError('Patient not found.', 'NOT_FOUND', 404);

  const consentStatus = body.consent_status as ConsentStatus;
  const contactedVia = sanitizeText(body.contacted_via, 200);
  const denialReason = consentStatus === 'denied' ? sanitizeText(body.denial_reason, 2000) : null;
  const decided = consentStatus !== 'pending';

  const { rows } = await query<{ id: string }>(
    `INSERT INTO doctor_consent_records
       (doctor_id, patient_user_id, consent_status, contacted_via, denial_reason, recorded_by_dev_id, decided_at)
     VALUES ($1, $2, $3, $4, $5, $6, ${decided ? 'now()' : 'NULL'})
     RETURNING id`,
    [body.doctor_id, body.patient_user_id, consentStatus, contactedVia, denialReason, dev.id],
  );
  const id = rows[0]!.id;

  await logAudit({
    userId: dev.id,
    action: 'doctor_consent_recorded',
    resourceType: 'doctor',
    resourceId: body.doctor_id,
    details: { record_id: id, consent_status: consentStatus, patient_user_id: body.patient_user_id },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, id }, 201);
}
