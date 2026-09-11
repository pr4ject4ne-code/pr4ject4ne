import { withTransaction, query, queryOne } from '@/lib/db';
import { checkRateLimit } from '@/lib/auth';
import { sanitizeText } from '@/lib/sanitize';
import { recomputeHospitalRatingAggregate } from '@/lib/hospital-rating-aggregate';

/**
 * Item 8 — the "general" (per-hospital, overall) rating: a single 1-5 score
 * plus an optional written review, one per (hospital, patient). Separate
 * from the per-department "in-depth" 3-axis breakdown (department-ratings.ts)
 * — see migration 032's header for why this is its own table rather than a
 * department-less row in department_ratings.
 */

export const GENERAL_RATING_USER_MAX = 20;
export const GENERAL_RATING_USER_WINDOW_SECONDS = 24 * 60 * 60;
export const GENERAL_RATING_HOSPITAL_MAX = 200;
export const GENERAL_RATING_HOSPITAL_WINDOW_SECONDS = 24 * 60 * 60;

export function checkGeneralRatingUserRateLimit(userId: string): Promise<boolean> {
  return checkRateLimit(`general_rating_user:${userId}`, GENERAL_RATING_USER_MAX, GENERAL_RATING_USER_WINDOW_SECONDS);
}
export function checkGeneralRatingHospitalRateLimit(hospitalId: string): Promise<boolean> {
  return checkRateLimit(
    `general_rating_hospital:${hospitalId}`,
    GENERAL_RATING_HOSPITAL_MAX,
    GENERAL_RATING_HOSPITAL_WINDOW_SECONDS,
  );
}

export interface SubmitGeneralRatingResult {
  general_avg: number;
  general_count: number;
  hospital_rating_avg: number;
  hospital_rating_count: number;
}

/**
 * Submit (or update) one patient's general rating of one hospital. Unlike
 * department ratings, there's no JSONB-array existence check needed — just
 * that the hospital exists and is approved.
 */
export async function submitGeneralRating(
  hospitalId: string,
  patientUserId: string,
  score: number,
  review: string | null,
): Promise<SubmitGeneralRatingResult | null> {
  const sanitizedReview = sanitizeText(review, 4000);
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO general_ratings (hospital_id, patient_user_id, score, review)
       SELECT $1, $2, $3, $4
       WHERE EXISTS (SELECT 1 FROM hospitals WHERE id = $1 AND status = 'approved')
       ON CONFLICT (hospital_id, patient_user_id)
       DO UPDATE SET score = EXCLUDED.score, review = EXCLUDED.review, updated_at = now()
       RETURNING id`,
      [hospitalId, patientUserId, score, sanitizedReview],
    );
    if (rows.length === 0) return null;

    await recomputeHospitalRatingAggregate(hospitalId, tx);

    const { rows: hospitalRows } = await tx.query<{ rating_avg: string; rating_count: string }>(
      `SELECT rating_avg, rating_count FROM hospitals WHERE id = $1`,
      [hospitalId],
    );
    const { rows: generalRows } = await tx.query<{ avg: string; count: string }>(
      `SELECT AVG(score)::numeric(4,3) AS avg, COUNT(*)::text AS count FROM general_ratings WHERE hospital_id = $1`,
      [hospitalId],
    );

    return {
      general_avg: Number(generalRows[0]?.avg ?? 0),
      general_count: Number(generalRows[0]?.count ?? 0),
      hospital_rating_avg: Number(hospitalRows[0]?.rating_avg ?? 0),
      hospital_rating_count: Number(hospitalRows[0]?.rating_count ?? 0),
    };
  });
}

export interface GeneralRatingSummary {
  avg: number;
  count: number;
}

/** The hospital's general-rating aggregate, excluding disputed rows (item 8). */
export async function fetchGeneralRatingSummary(hospitalId: string): Promise<GeneralRatingSummary> {
  const { rows } = await query<{ avg: string | null; count: string }>(
    `SELECT AVG(g.score)::numeric(4,3) AS avg, COUNT(*)::text AS count
     FROM general_ratings g
     WHERE g.hospital_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM rating_disputes rd WHERE rd.general_rating_id = g.id AND rd.status IN ('pending', 'upheld')
       )`,
    [hospitalId],
  );
  return { avg: rows[0]?.avg ? Number(rows[0].avg) : 0, count: Number(rows[0]?.count ?? '0') };
}

export interface PatientGeneralRating {
  id: string;
  score: number;
  review: string | null;
}

/** One patient's own general rating of a hospital, if they've left one. */
export async function fetchPatientGeneralRating(
  hospitalId: string,
  patientUserId: string,
): Promise<PatientGeneralRating | null> {
  return queryOne<PatientGeneralRating>(
    `SELECT id, score, review FROM general_ratings WHERE hospital_id = $1 AND patient_user_id = $2`,
    [hospitalId, patientUserId],
  );
}
