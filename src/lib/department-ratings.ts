import type { QueryResultRow } from 'pg';
import { query, withTransaction } from '@/lib/db';
import { checkRateLimit } from '@/lib/auth';
import { sanitizeText } from '@/lib/sanitize';
import { recomputeHospitalRatingAggregate } from '@/lib/hospital-rating-aggregate';

/**
 * Racoon Eye — per-department "in-depth" hospital ratings (item 8 reworked
 * this from a single 1-5 `score` into a 3-axis breakdown: staff/individuals,
 * service, infrastructure, equally weighted — plus an optional text review).
 *
 * Open rating for v1: any authenticated patient may rate any approved
 * hospital's departments, no visit-verification. One row per
 * (hospital, department, patient) — a resubmission by the same patient for
 * the same department UPDATEs the existing row (ON CONFLICT upsert) rather
 * than creating a duplicate.
 *
 * `department_id` deliberately has NO foreign key — see migration
 * 024_department_ratings.sql's header for why (it references an id living
 * inside a JSONB array, which Postgres cannot FK against).
 *
 * The hospital-level combined score is no longer computed here directly —
 * see hospital-rating-aggregate.ts's recomputeHospitalRatingAggregate,
 * shared with general_ratings so both rating types blend into one number.
 */

export interface TxClient {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: R[] }>;
}

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

export const DEPARTMENT_RATING_USER_MAX = 20;
export const DEPARTMENT_RATING_USER_WINDOW_SECONDS = 24 * 60 * 60; // 1 day
export const DEPARTMENT_RATING_HOSPITAL_MAX = 200;
export const DEPARTMENT_RATING_HOSPITAL_WINDOW_SECONDS = 24 * 60 * 60; // 1 day

export function checkDepartmentRatingUserRateLimit(userId: string): Promise<boolean> {
  return checkRateLimit(
    `department_rating_user:${userId}`,
    DEPARTMENT_RATING_USER_MAX,
    DEPARTMENT_RATING_USER_WINDOW_SECONDS,
  );
}

export function checkDepartmentRatingHospitalRateLimit(hospitalId: string): Promise<boolean> {
  return checkRateLimit(
    `department_rating_hospital:${hospitalId}`,
    DEPARTMENT_RATING_HOSPITAL_MAX,
    DEPARTMENT_RATING_HOSPITAL_WINDOW_SECONDS,
  );
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export interface SubmitDepartmentRatingInput {
  staffScore: number;
  serviceScore: number;
  infrastructureScore: number;
  review?: string | null;
}

export interface SubmitRatingResult {
  department_avg: number;
  department_count: number;
  hospital_rating_avg: number;
  hospital_rating_count: number;
}

/**
 * Submit (or update) one patient's in-depth rating of one department at one
 * hospital. The INSERT itself is the integrity check — no separate
 * SELECT-then-write TOCTOU gap (see migration 024's header for why
 * department_id can't be a real FK). Returns `null` when the department/
 * hospital pair is invalid or the hospital isn't approved (zero rows
 * inserted) — the caller (the POST route) treats that as a 404, never a 500.
 */
export async function submitDepartmentRating(
  hospitalId: string,
  departmentId: string,
  patientUserId: string,
  input: SubmitDepartmentRatingInput,
): Promise<SubmitRatingResult | null> {
  const review = sanitizeText(input.review ?? null, 4000);
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO department_ratings
         (hospital_id, department_id, patient_user_id, staff_score, service_score, infrastructure_score, review)
       SELECT $1, $2, $3, $4, $5, $6, $7
       WHERE EXISTS (
         SELECT 1 FROM hospitals h, jsonb_array_elements(h.departments) d
         WHERE h.id = $1 AND h.status = 'approved' AND d->>'id' = $2::text
       )
       ON CONFLICT (hospital_id, department_id, patient_user_id)
       DO UPDATE SET
         staff_score = EXCLUDED.staff_score,
         service_score = EXCLUDED.service_score,
         infrastructure_score = EXCLUDED.infrastructure_score,
         review = EXCLUDED.review,
         updated_at = now()
       RETURNING id`,
      [hospitalId, departmentId, patientUserId, input.staffScore, input.serviceScore, input.infrastructureScore, review],
    );
    if (rows.length === 0) return null;

    await recomputeHospitalRatingAggregate(hospitalId, tx);

    const { rows: hospitalRows } = await tx.query<{ rating_avg: string; rating_count: string }>(
      `SELECT rating_avg, rating_count FROM hospitals WHERE id = $1`,
      [hospitalId],
    );
    const { rows: deptRows } = await tx.query<{ avg: string; count: string }>(
      `SELECT AVG((staff_score + service_score + infrastructure_score) / 3.0)::numeric(4,3) AS avg, COUNT(*)::text AS count
       FROM department_ratings WHERE hospital_id = $1 AND department_id = $2`,
      [hospitalId, departmentId],
    );

    return {
      department_avg: Number(deptRows[0]?.avg ?? 0),
      department_count: Number(deptRows[0]?.count ?? 0),
      hospital_rating_avg: Number(hospitalRows[0]?.rating_avg ?? 0),
      hospital_rating_count: Number(hospitalRows[0]?.rating_count ?? 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface DepartmentAggregate {
  /** Equal-thirds composite average across all (non-disputed) raters. */
  avg: number;
  count: number;
  staff_avg: number;
  service_avg: number;
  infrastructure_avg: number;
}

/** All per-department aggregates for a hospital, keyed by department_id.
 *  Excludes ratings with an open/upheld dispute against them (item 8),
 *  matching recomputeHospitalRatingAggregate's own exclusion rule. */
export async function fetchDepartmentAggregates(
  hospitalId: string,
): Promise<Record<string, DepartmentAggregate>> {
  const { rows } = await query<{
    department_id: string;
    avg: string;
    count: string;
    staff_avg: string;
    service_avg: string;
    infrastructure_avg: string;
  }>(
    `SELECT d.department_id,
            AVG((d.staff_score + d.service_score + d.infrastructure_score) / 3.0)::numeric(4,3) AS avg,
            COUNT(*)::text AS count,
            AVG(d.staff_score)::numeric(4,3) AS staff_avg,
            AVG(d.service_score)::numeric(4,3) AS service_avg,
            AVG(d.infrastructure_score)::numeric(4,3) AS infrastructure_avg
     FROM department_ratings d
     WHERE d.hospital_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM rating_disputes rd
         WHERE rd.department_rating_id = d.id AND rd.status IN ('pending', 'upheld')
       )
     GROUP BY d.department_id`,
    [hospitalId],
  );
  const out: Record<string, DepartmentAggregate> = {};
  for (const row of rows) {
    out[row.department_id] = {
      avg: Number(row.avg),
      count: Number(row.count),
      staff_avg: Number(row.staff_avg),
      service_avg: Number(row.service_avg),
      infrastructure_avg: Number(row.infrastructure_avg),
    };
  }
  return out;
}

export interface PatientDepartmentRating {
  id: string;
  staff_score: number;
  service_score: number;
  infrastructure_score: number;
  review: string | null;
}

/** One patient's own in-depth ratings for every department they've rated at a hospital. */
export async function fetchPatientDepartmentRatings(
  hospitalId: string,
  patientUserId: string,
): Promise<Record<string, PatientDepartmentRating>> {
  const { rows } = await query<{
    id: string;
    department_id: string;
    staff_score: number;
    service_score: number;
    infrastructure_score: number;
    review: string | null;
  }>(
    `SELECT id, department_id, staff_score, service_score, infrastructure_score, review
     FROM department_ratings WHERE hospital_id = $1 AND patient_user_id = $2`,
    [hospitalId, patientUserId],
  );
  const out: Record<string, PatientDepartmentRating> = {};
  for (const row of rows) {
    out[row.department_id] = {
      id: row.id,
      staff_score: Number(row.staff_score),
      service_score: Number(row.service_score),
      infrastructure_score: Number(row.infrastructure_score),
      review: row.review,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Department-removal cascade
// ---------------------------------------------------------------------------

/**
 * When a hospital owner saves a new `departments` array that drops one or
 * more departments, their ratings become orphaned (no FK to cascade via —
 * see migration 024's header) and must be cleaned up explicitly. Called from
 * INSIDE the same transaction as the `departments` column write in
 * `PATCH /api/hospital/[id]/info` (accepts an existing `tx`, never opens its
 * own transaction) so the department-list write and the ratings cleanup
 * commit or roll back together — never one without the other.
 *
 * No-ops (no queries at all) when `removedDepartmentIds` is empty, so a save
 * that doesn't remove any department costs nothing extra.
 */
export async function cascadeDeleteRemovedDepartmentRatings(
  hospitalId: string,
  removedDepartmentIds: string[],
  tx: TxClient,
): Promise<void> {
  if (removedDepartmentIds.length === 0) return;

  await tx.query(
    `DELETE FROM department_ratings WHERE hospital_id = $1 AND department_id = ANY($2::uuid[])`,
    [hospitalId, removedDepartmentIds],
  );

  await recomputeHospitalRatingAggregate(hospitalId, tx);
}
