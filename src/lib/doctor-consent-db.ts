import { query, queryOne } from '@/lib/db';
import type { ConsentStatus } from '@/types';
import type { DoctorAttributionLookup } from '@/lib/doctor-report';

/**
 * DB-touching companion to the pure src/lib/doctor-report.ts — kept separate
 * so the attribution/consent-gating LOGIC stays independently unit-testable
 * with no database, matching this project's existing pure/DB-wrapper split
 * (e.g. sharing-prefs.ts vs. the route that calls it).
 *
 * Resolves each doctor_id's MOST RECENT `doctor_consent_records` row FOR THIS
 * EXACT (patient, clinical_condition) PAIR (migration 029 — see that file for
 * why patient-level scoping alone wasn't enough: one approval used to cover
 * every condition citing that doctor, even ones never actually reviewed).
 * A (doctor, condition) combination with no row at all correctly comes back
 * with `consentStatus: null` via the LEFT JOIN LATERAL — never defaulted to
 * anything else, and never picks up a row recorded for a DIFFERENT patient
 * or a DIFFERENT field. `patientUserId` MUST be the biodata owner's own
 * user_id (the caller's already-authorized read target), never a value taken
 * from request input.
 */
export async function fetchDoctorAttributionLookup(
  pairs: Array<{ doctorId: string; conditionId: string }>,
  patientUserId: string,
): Promise<DoctorAttributionLookup> {
  // De-dupe by the composite key — a patient could (in principle) cite the
  // same doctor for the same condition id twice across malformed input.
  const unique = new Map(pairs.filter((p) => p.doctorId && p.conditionId).map((p) => [`${p.doctorId}:${p.conditionId}`, p]));
  if (unique.size === 0) return {};

  const doctorIds = Array.from(new Set(Array.from(unique.values()).map((p) => p.doctorId)));
  const conditionIds = Array.from(new Set(Array.from(unique.values()).map((p) => p.conditionId)));

  const { rows } = await query<{
    id: string;
    name: string;
    contact_phone: string | null;
    contact_email: string | null;
    condition_id: string;
    consent_status: ConsentStatus | null;
    denial_reason: string | null;
  }>(
    `SELECT d.id, d.name, d.contact_phone, d.contact_email, fid.condition_id,
            c.consent_status, c.denial_reason
     FROM doctors d
     CROSS JOIN unnest($2::text[]) AS fid(condition_id)
     LEFT JOIN LATERAL (
       SELECT consent_status, denial_reason
       FROM doctor_consent_records r
       WHERE r.doctor_id = d.id AND r.patient_user_id = $3 AND r.clinical_condition_id = fid.condition_id
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 1
     ) c ON true
     WHERE d.id = ANY($1::uuid[])`,
    [doctorIds, conditionIds, patientUserId],
  );

  const lookup: DoctorAttributionLookup = {};
  for (const row of rows) {
    const key = `${row.id}:${row.condition_id}`;
    if (!unique.has(key)) continue; // only keep pairs actually requested (cross join is doctors × all condition ids)
    lookup[key] = {
      doctor: { id: row.id, name: row.name, contact_phone: row.contact_phone, contact_email: row.contact_email },
      consentStatus: row.consent_status,
      denialReason: row.denial_reason,
    };
  }
  return lookup;
}

/** A doctor's roster entry, for the patient-facing "pick a doctor" search. */
export interface DoctorSearchResult {
  id: string;
  name: string;
  specialty: string | null;
  hospital_id: string;
  hospital_name: string;
}

/** Patient-facing doctor search (name or hospital name) — same roster data
 *  already public via GET /api/hospitals/[id], just searchable across
 *  hospitals so a patient doesn't have to know which hospital their doctor
 *  is listed under. */
export async function searchDoctors(q: string, limit: number): Promise<DoctorSearchResult[]> {
  const params: unknown[] = [];
  let where = '';
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE (d.name ILIKE $${params.length} OR h.name ILIKE $${params.length})`;
  }
  params.push(limit);
  const { rows } = await query<DoctorSearchResult>(
    `SELECT d.id, d.name, d.specialty, h.id AS hospital_id, h.name AS hospital_name
     FROM doctors d JOIN hospitals h ON h.id = d.hospital_id
     ${where}
     ORDER BY d.name ASC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

export async function findDoctorById(doctorId: string): Promise<{ id: string; name: string; contact_email: string | null } | null> {
  return queryOne(`SELECT id, name, contact_email FROM doctors WHERE id = $1`, [doctorId]);
}
