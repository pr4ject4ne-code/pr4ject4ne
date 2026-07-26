import type { BiodataLayer } from '@/types';

/**
 * Strips `doctor_id` from every clinical_conditions entry before a
 * cross-user (non-owner) biodata response leaves the server.
 *
 * `doctor_id` is a plain UUID, not a secret — but `GET /api/hospitals/[id]`
 * is a public, unauthenticated endpoint that returns every hospital's
 * doctor roster (id + name). Leaving the raw id in a cross-user response
 * would let any authenticated caller cross-reference it against that
 * roster and learn exactly which doctor was credited on someone else's
 * record, even when that doctor's consent (see doctor-consent-db.ts,
 * migration 016) is denied, pending, or nonexistent — defeating the
 * anonymization the doctor-report feature (#29/#30) exists to guarantee.
 *
 * Attribution is still correctly surfaced through the separate, properly
 * gated `report` field wherever one is built (src/lib/doctor-report.ts) —
 * this only removes the raw id from the RAW biodata_layer, never from the
 * stored record, and must be applied by every route that can return a
 * cross-user (IHN-authenticated, non-owner) response:
 *   - GET /api/biodata/[userId] (the owner's own read is unaffected — this
 *     must only run on the non-owner branch, since a user's own doctor_id
 *     on their own data is not a leak)
 *   - GET /api/biodata/lookup (the by-IHN-code "string tab" lookup)
 */
export function stripDoctorIdsFromClinicalConditions(
  biodataLayer: Partial<BiodataLayer>,
): Partial<BiodataLayer> {
  if (!biodataLayer.clinical_conditions) return biodataLayer;
  return {
    ...biodataLayer,
    clinical_conditions: biodataLayer.clinical_conditions.map(({ doctor_id: _doctorId, ...rest }) => rest),
  };
}
