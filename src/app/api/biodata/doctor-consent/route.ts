import { cookies } from 'next/headers';
import { query, queryOne } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getPatientSession, checkRateLimit } from '@/lib/auth';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { searchDoctors, findDoctorById } from '@/lib/doctor-consent-db';
import { sendEmail } from '@/lib/email';
import { buildDoctorConsentRequestEmail } from '@/lib/email-templates';
import type { Biodata } from '@/types';

/**
 * Item 4 (patient-initiated half): a patient requests doctor confirmation of
 * ONE specific clinical_condition entry. Still within the deliberate
 * "no doctor self-serve portal" scope decision (migration 014/019) — this
 * only creates the initial 'pending' record and emails the doctor; a
 * developer still records the actual outcome via /api/dev/doctor-consent
 * once the doctor replies out-of-band. See migration 029 for why this is
 * scoped per FIELD, not just per doctor+patient.
 */

async function requireOwner(): Promise<string | null> {
  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);
  return session?.user_id ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET ?q= — patient-facing doctor search (any authenticated patient; the
 *  underlying roster is already public per hospital via GET /api/hospitals/[id],
 *  this just makes it searchable across hospitals so a patient doesn't need
 *  to know which one their doctor is listed under). */
export async function GET(req: Request) {
  const userId = await requireOwner();
  if (!userId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  const results = await searchDoctors(q, 20);
  return apiOk(results);
}

interface RequestBody {
  clinical_condition_id?: string;
  doctor_id?: string;
}

export async function POST(req: Request) {
  const userId = await requireOwner();
  if (!userId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  // Rate-limited per patient, not per IP — this sends real email to a real
  // doctor, so it needs a tighter, identity-scoped cap than an anonymous
  // action would (mirrors the reasoning in suggestions/route.ts, just scoped
  // to the authenticated user instead of IP since this route requires auth).
  const allowed = await checkRateLimit(`doctor_consent_request:${userId}`, 10, 3600);
  if (!allowed) return apiError('Too many requests. Please try again later.', 'RATE_LIMITED', 429);

  const body = await readJson<RequestBody>(req);
  if (!body || !UUID_RE.test(body.clinical_condition_id ?? '') || !UUID_RE.test(body.doctor_id ?? '')) {
    return apiError('clinical_condition_id and doctor_id are required.', 'BAD_REQUEST', 400);
  }
  const { clinical_condition_id: conditionId, doctor_id: doctorId } = body as Required<RequestBody>;

  const record = await queryOne<Biodata>(`SELECT profile_layer, biodata_layer FROM biodata WHERE user_id = $1`, [userId]);
  if (!record) return apiError('Biodata not found.', 'NOT_FOUND', 404);

  const conditions = record.biodata_layer.clinical_conditions ?? [];
  const conditionIndex = conditions.findIndex((c) => c.id === conditionId);
  if (conditionIndex === -1) return apiError('Condition not found.', 'NOT_FOUND', 404);
  const condition = conditions[conditionIndex]!;

  const doctor = await findDoctorById(doctorId);
  if (!doctor) return apiError('Doctor not found.', 'NOT_FOUND', 404);
  if (!doctor.contact_email) {
    return apiError('This doctor has no contact email on file, so a request cannot be sent automatically.', 'NO_DOCTOR_EMAIL', 422);
  }

  // Attach the doctor to this exact field (this is the UI that was
  // previously missing entirely — doctor_id existed in the type but nothing
  // ever set it). Only this one condition is touched; every other field in
  // biodata_layer is left byte-for-byte as it was.
  const nextConditions = [...conditions];
  nextConditions[conditionIndex] = { ...condition, doctor_id: doctorId };
  await query(
    `UPDATE biodata SET biodata_layer = jsonb_set(biodata_layer, '{clinical_conditions}', $2::jsonb), last_modified_at = now()
     WHERE user_id = $1`,
    [userId, JSON.stringify(nextConditions)],
  );

  await query(
    `INSERT INTO doctor_consent_records
       (doctor_id, patient_user_id, clinical_condition_id, consent_status, contacted_via, doctor_email)
     VALUES ($1, $2, $3, 'pending', 'email', $4)`,
    [doctorId, userId, conditionId, doctor.contact_email],
  );

  const patientName = record.profile_layer.full_name || 'A patient';
  const fieldLabel = 'Condition';
  const fieldValue = [condition.condition, condition.cause ? `cause: ${condition.cause}` : null].filter(Boolean).join(', ');

  // Replies route to active primary devs' inboxes (same recipient-selection
  // pattern as suggestion-notify.ts), since there's still no doctor-facing
  // reply-handling in the app — a human on our side reviews the reply and
  // records the outcome via the dev consent tool.
  const { rows: devRows } = await query<{ email: string }>(
    `SELECT email FROM users WHERE account_type = 'developer' AND access_level = 'primary' AND is_active = TRUE`,
  );

  const { subject, html, text } = buildDoctorConsentRequestEmail({
    doctorName: doctor.name,
    patientName,
    fieldLabel,
    fieldValue,
    replyToEmail: devRows[0]?.email ?? doctor.contact_email,
  });
  const emailResult = await sendEmail({
    to: doctor.contact_email,
    subject,
    html,
    text,
    replyTo: devRows.length > 0 ? devRows.map((r) => r.email) : undefined,
  });

  await logAudit({
    userId,
    action: 'doctor_consent_request',
    resourceType: 'doctor_consent_records',
    resourceId: doctorId,
    details: { clinical_condition_id: conditionId, email_sent: emailResult.sent },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ status: 'pending', email_sent: emailResult.sent }, 201);
}
