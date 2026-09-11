import { query, queryOne } from '@/lib/db';
import { apiError, apiOk, readJson, parseLimit, parseOffset } from '@/lib/api';
import { getDevUser } from '@/lib/dev-auth';
import { sanitizeText, escapeLikePattern } from '@/lib/sanitize';
import { isValidEmail } from '@/lib/validation';
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
 * ANY DEVELOPER, PRIMARY OR SECONDARY (item 6 — corrected from an earlier,
 * self-imposed PRIMARY-ONLY restriction added in the same pass migration 029
 * shipped in): a patient's medical record is squarely "a user", and item 6's
 * policy is that secondary devs have the SAME authority as primary over
 * hospital admins and users — the primary/secondary split is reserved for
 * actions on OTHER DEVELOPER accounts (/api/dev/accounts stays primary-only;
 * this route was never actually that, it just borrowed that bar without the
 * user having asked for it here).
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
 * GET — THREE resources, selected via `?resource=`:
 *  - `requests` (item 4) — the dev's queue: every (doctor, patient, field)
 *    triple whose MOST RECENT row is still 'pending', with the actual
 *    condition text resolved from that patient's biodata so a dev knows
 *    what they're being asked to confirm without a second lookup. A triple
 *    that has since moved to approved/denied (a later row exists) never
 *    appears here — DISTINCT ON (doctor_id, patient_user_id,
 *    clinical_condition_id) ORDER BY created_at DESC picks each triple's
 *    latest row, then the outer query keeps only the ones still pending.
 *  - `doctors` (default) — search doctors by name/hospital name (ILIKE, same
 *    pattern as before). When `patient_user_id` AND `clinical_condition_id`
 *    are both supplied, each doctor's MOST RECENT consent record for THAT
 *    EXACT field is folded in (migration 029 — a patient_user_id alone is no
 *    longer enough to resolve a meaningful status, since one doctor+patient
 *    pair can now have different statuses per field).
 *  - `patients` — search patient accounts by email (ILIKE, same
 *    escapeLikePattern pattern as the doctor search) so a developer can
 *    identify the target patient before selecting a doctor. Only
 *    `account_type = 'patient'` rows are ever returned.
 * Any developer, primary or secondary (item 6).
 */
export async function GET(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const url = new URL(req.url);
  const resourceParam = url.searchParams.get('resource');
  const resource = resourceParam === 'patients' ? 'patients' : resourceParam === 'requests' ? 'requests' : 'doctors';
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = parseLimit(url.searchParams.get('limit'), 25, 100);
  const offset = parseOffset(url.searchParams.get('offset'));

  if (resource === 'requests') {
    const { rows } = await query(
      `SELECT * FROM (
         SELECT DISTINCT ON (r.doctor_id, r.patient_user_id, r.clinical_condition_id)
                r.id, r.doctor_id, d.name AS doctor_name, r.patient_user_id, u.email AS patient_email,
                r.clinical_condition_id, r.consent_status, r.created_at,
                (SELECT elem ->> 'condition'
                   FROM jsonb_array_elements(coalesce(b.biodata_layer -> 'clinical_conditions', '[]'::jsonb)) elem
                  WHERE elem ->> 'id' = r.clinical_condition_id
                  LIMIT 1) AS condition_text
         FROM doctor_consent_records r
         JOIN doctors d ON d.id = r.doctor_id
         JOIN users u ON u.id = r.patient_user_id
         LEFT JOIN biodata b ON b.user_id = r.patient_user_id
         ORDER BY r.doctor_id, r.patient_user_id, r.clinical_condition_id, r.created_at DESC, r.id DESC
       ) latest
       WHERE latest.consent_status = 'pending'
       ORDER BY latest.created_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return apiOk({ requests: rows, limit, offset });
  }

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
  const conditionParam = url.searchParams.get('clinical_condition_id');
  const conditionId = patientUserId && conditionParam && conditionParam.trim() ? conditionParam.trim() : null;

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
    'NULL::text AS denial_reason, NULL::timestamptz AS decided_at, NULL::timestamptz AS consent_recorded_at, ' +
    'NULL::text AS doctor_email, NULL::text AS doctor_signature';
  let consentJoin = '';
  if (patientUserId && conditionId) {
    params.push(patientUserId, conditionId);
    const patientIdx = params.length - 1;
    const conditionIdx = params.length;
    consentSelect =
      'c.id AS consent_id, c.consent_status, c.contacted_via, c.denial_reason, c.decided_at, ' +
      'c.created_at AS consent_recorded_at, c.doctor_email, c.doctor_signature';
    consentJoin = `LEFT JOIN LATERAL (
       SELECT * FROM doctor_consent_records r
       WHERE r.doctor_id = d.id AND r.patient_user_id = $${patientIdx} AND r.clinical_condition_id = $${conditionIdx}
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

  return apiOk({ doctors: rows, total, limit, offset, patient_user_id: patientUserId, clinical_condition_id: conditionId });
}

interface CreateBody {
  doctor_id?: string;
  patient_user_id?: string;
  clinical_condition_id?: string;
  consent_status?: string;
  contacted_via?: string;
  denial_reason?: string;
  /** Which email the doctor was actually contacted/replied at — captured
   * per-record since a roster email can change later (see migration 019). */
  doctor_email?: string;
  /** Free-text evidence of the doctor's signed confirmation (e.g. a pasted
   * email reply, a note about a signed form) — not a real e-signature/auth
   * system, just a place to record what was received. */
  doctor_signature?: string;
}

/**
 * POST — record the outcome of a NEW contact attempt with a doctor, scoped to
 * one specific patient's record (a fresh row, never an in-place mutation of
 * history — see migration 014's "most recent row wins" design). Any developer, primary or secondary (item 6).
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

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

  if (!body.clinical_condition_id || !body.clinical_condition_id.trim()) {
    return apiError('A clinical_condition_id is required — consent is scoped to one field, not the whole record.', 'BAD_REQUEST', 400);
  }
  const conditionId = body.clinical_condition_id.trim();
  const biodataRow = await queryOne<{ clinical_conditions: Array<{ id: string }> }>(
    `SELECT coalesce(biodata_layer -> 'clinical_conditions', '[]'::jsonb) AS clinical_conditions
     FROM biodata WHERE user_id = $1`,
    [body.patient_user_id],
  );
  const conditionExists = (biodataRow?.clinical_conditions ?? []).some((c) => c.id === conditionId);
  if (!conditionExists) {
    return apiError('That clinical_condition_id does not belong to this patient.', 'BAD_REQUEST', 400);
  }

  const consentStatus = body.consent_status as ConsentStatus;
  const contactedVia = sanitizeText(body.contacted_via, 200);
  const denialReason = consentStatus === 'denied' ? sanitizeText(body.denial_reason, 2000) : null;
  const decided = consentStatus !== 'pending';
  const doctorEmail =
    typeof body.doctor_email === 'string' && isValidEmail(body.doctor_email.trim())
      ? body.doctor_email.trim()
      : null;
  const doctorSignature = sanitizeText(body.doctor_signature, 4000);

  const { rows } = await query<{ id: string }>(
    `INSERT INTO doctor_consent_records
       (doctor_id, patient_user_id, clinical_condition_id, consent_status, contacted_via, denial_reason, recorded_by_dev_id,
        decided_at, doctor_email, doctor_signature)
     VALUES ($1, $2, $3, $4, $5, $6, $7, ${decided ? 'now()' : 'NULL'}, $8, $9)
     RETURNING id`,
    [body.doctor_id, body.patient_user_id, conditionId, consentStatus, contactedVia, denialReason, dev.id, doctorEmail, doctorSignature],
  );
  const id = rows[0]!.id;

  await logAudit({
    userId: dev.id,
    action: 'doctor_consent_recorded',
    resourceType: 'doctor',
    resourceId: body.doctor_id,
    details: { record_id: id, consent_status: consentStatus, patient_user_id: body.patient_user_id, clinical_condition_id: conditionId },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, id }, 201);
}
