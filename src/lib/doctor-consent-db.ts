import { query } from '@/lib/db';
import type { ConsentStatus } from '@/types';
import type { DoctorAttributionLookup } from '@/lib/doctor-report';

/**
 * DB-touching companion to the pure src/lib/doctor-report.ts — kept separate
 * so the attribution/consent-gating LOGIC stays independently unit-testable
 * with no database, matching this project's existing pure/DB-wrapper split
 * (e.g. sharing-prefs.ts vs. the route that calls it).
 *
 * Resolves each doctor_id's MOST RECENT `doctor_consent_records` row (a
 * doctor with no row at all correctly comes back with `consentStatus: null`
 * via the LEFT JOIN LATERAL — never defaulted to anything else).
 */
export async function fetchDoctorAttributionLookup(doctorIds: string[]): Promise<DoctorAttributionLookup> {
  const uniqueIds = Array.from(new Set(doctorIds)).filter(Boolean);
  if (uniqueIds.length === 0) return {};

  const { rows } = await query<{
    id: string;
    name: string;
    contact_phone: string | null;
    contact_email: string | null;
    consent_status: ConsentStatus | null;
    denial_reason: string | null;
  }>(
    `SELECT d.id, d.name, d.contact_phone, d.contact_email,
            c.consent_status, c.denial_reason
     FROM doctors d
     LEFT JOIN LATERAL (
       SELECT consent_status, denial_reason
       FROM doctor_consent_records r
       WHERE r.doctor_id = d.id
       ORDER BY r.created_at DESC
       LIMIT 1
     ) c ON true
     WHERE d.id = ANY($1::uuid[])`,
    [uniqueIds],
  );

  const lookup: DoctorAttributionLookup = {};
  for (const row of rows) {
    lookup[row.id] = {
      doctor: { id: row.id, name: row.name, contact_phone: row.contact_phone, contact_email: row.contact_email },
      consentStatus: row.consent_status,
      denialReason: row.denial_reason,
    };
  }
  return lookup;
}
