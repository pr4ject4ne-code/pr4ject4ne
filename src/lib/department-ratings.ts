import type { QueryResultRow } from 'pg';
import { query, withTransaction } from '@/lib/db';
import { checkRateLimit } from '@/lib/auth';

/**
 * Racoon Eye v1 — per-department hospital ratings (Phase 1 backend).
 *
 * Open rating for v1: any authenticated patient may rate any approved
 * hospital's departments, no visit-verification, no minimum-ratings floor —
 * callers always show the raw average + count together.
 *
 * IMPORTANT for future readers: the hospital-level aggregate
 * (hospitals.rating_avg/rating_count) is a PLAIN `AVG(score)`/`COUNT(*)` over
 * every department_ratings row for the hospital. Do NOT "fix" this into a
 * per-department weighted sum. The founder's stated weighting rule ("each
 * department's contribution weight = its share of the hospital's total
 * rating count") algebraically collapses to exactly this plain average:
 *   Sum_i(dept_avg_i * dept_count_i) / Sum_i(dept_count_i) == AVG(score)
 *   over every row, regardless of how the rows are grouped by department.
 * A weighted-sum implementation would compute the identical number with
 * more code — see migrations/024_department_ratings.sql for the same note.
 */

/**
 * Shape of the transaction-scoped client `withTransaction` hands its
 * callback (src/lib/db.ts doesn't export this type, so it's mirrored here —
 * same approach every other lib module that composes into a caller's
 * transaction uses, e.g. password-reset.ts).
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

/**
 * Two independent buckets, mirroring the dual per-target + per-source pattern
 * already used by biodata sharing (src/app/api/biodata/[userId]/route.ts):
 *  - per-user: bounds a single spammy account from hammering the endpoint.
 *  - per-hospital-target: bounds a multi-account pile-on against one hospital
 *    (e.g. a coordinated review-bombing attempt).
 * Either tripping is a 429; both are checked independently so a caller can
 * tell (and a test can assert) which bucket fired.
 */
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

export interface SubmitRatingResult {
  department_avg: number;
  department_count: number;
  hospital_rating_avg: number;
  hospital_rating_count: number;
}

/**
 * Submit (or update) one patient's rating of one department at one hospital.
 *
 * The INSERT itself is the integrity check — no separate SELECT-then-write
 * TOCTOU gap. `WHERE EXISTS (...)` only lets the row through when `$2` is a
 * real id inside THIS hospital's `departments` JSONB array AND the hospital
 * is `status = 'approved'`; there is no native FK to enforce this (JSONB
 * array elements can't be FK targets — see migration 024's header comment).
 * A resubmission by the same (hospital, department, patient) triple UPDATEs
 * the existing row via ON CONFLICT rather than creating a duplicate.
 *
 * Returns `null` when the department/hospital pair is invalid or the
 * hospital isn't approved (zero rows inserted) — the caller (the POST route)
 * treats that as a 404, never a 500.
 */
export async function submitDepartmentRating(
  hospitalId: string,
  departmentId: string,
  patientUserId: string,
  score: number,
): Promise<SubmitRatingResult | null> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO department_ratings (hospital_id, department_id, patient_user_id, score)
       SELECT $1, $2, $3, $4
       WHERE EXISTS (
         SELECT 1 FROM hospitals h, jsonb_array_elements(h.departments) d
         WHERE h.id = $1 AND h.status = 'approved' AND d->>'id' = $2::text
       )
       ON CONFLICT (hospital_id, department_id, patient_user_id)
       DO UPDATE SET score = EXCLUDED.score, updated_at = now()
       RETURNING id`,
      [hospitalId, departmentId, patientUserId, score],
    );
    if (rows.length === 0) return null;

    // Recompute + write the hospital-level aggregate (plain AVG/COUNT — see
    // this file's header comment). At least one row exists at this point
    // (the one just inserted/updated), so AVG can never be NULL here.
    await tx.query(
      `UPDATE hospitals
       SET rating_avg = (SELECT AVG(score)::numeric(3,2) FROM department_ratings WHERE hospital_id = $1),
           rating_count = (SELECT COUNT(*) FROM department_ratings WHERE hospital_id = $1)
       WHERE id = $1`,
      [hospitalId],
    );

    const { rows: hospitalRows } = await tx.query<{ rating_avg: string; rating_count: string }>(
      `SELECT rating_avg, rating_count FROM hospitals WHERE id = $1`,
      [hospitalId],
    );
    const { rows: deptRows } = await tx.query<{ avg: string; count: string }>(
      `SELECT AVG(score)::numeric(3,2) AS avg, COUNT(*)::text AS count
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
  avg: number;
  count: number;
}

/** All per-department averages/counts for a hospital, keyed by department_id. */
export async function fetchDepartmentAggregates(
  hospitalId: string,
): Promise<Record<string, DepartmentAggregate>> {
  const { rows } = await query<{ department_id: string; avg: string; count: string }>(
    `SELECT department_id, AVG(score)::numeric(3,2) AS avg, COUNT(*)::text AS count
     FROM department_ratings WHERE hospital_id = $1 GROUP BY department_id`,
    [hospitalId],
  );
  const out: Record<string, DepartmentAggregate> = {};
  for (const row of rows) {
    out[row.department_id] = { avg: Number(row.avg), count: Number(row.count) };
  }
  return out;
}

/** One patient's own scores for every department they've rated at a hospital. */
export async function fetchPatientDepartmentRatings(
  hospitalId: string,
  patientUserId: string,
): Promise<Record<string, number>> {
  const { rows } = await query<{ department_id: string; score: number }>(
    `SELECT department_id, score FROM department_ratings WHERE hospital_id = $1 AND patient_user_id = $2`,
    [hospitalId, patientUserId],
  );
  const out: Record<string, number> = {};
  for (const row of rows) {
    out[row.department_id] = Number(row.score);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Department-removal cascade
// ---------------------------------------------------------------------------

/**
 * When a hospital owner saves a new `departments` array that drops one or
 * more departments, their ratings become orphaned (no FK to cascade via —
 * see this file's header comment) and must be cleaned up explicitly. Called
 * from INSIDE the same transaction as the `departments` column write in
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

  // Recompute the hospital aggregate over whatever ratings remain. COALESCE
  // to 0 because AVG() over zero remaining rows is NULL, and rating_avg is
  // NOT NULL DEFAULT 0 (a hospital can be rated back down to "no ratings").
  await tx.query(
    `UPDATE hospitals
     SET rating_avg = COALESCE(
           (SELECT AVG(score)::numeric(3,2) FROM department_ratings WHERE hospital_id = $1), 0),
         rating_count = (SELECT COUNT(*) FROM department_ratings WHERE hospital_id = $1)
     WHERE id = $1`,
    [hospitalId],
  );
}
