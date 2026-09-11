import { query, queryOne, withTransaction } from '@/lib/db';
import { sanitizeText } from '@/lib/sanitize';
import { recomputeHospitalRatingAggregate } from '@/lib/hospital-rating-aggregate';
import type { TxClient } from '@/lib/hospital-rating-aggregate';

/**
 * Item 8 — a hospital disputing a specific rating (general OR department/
 * in-depth) as unfair. See migration 033's header for the full data-model
 * rationale (exactly-one-target CHECK, one-open-dispute-per-rating unique
 * index, live dispute-status exclusion rather than a cached flag).
 *
 * Filing is scoped to the hospital's OWN ratings only — enforced by joining
 * through whichever table the rating lives in and checking hospital_id
 * matches the filer's own hospital, never trusting a hospital_id the caller
 * merely asserts in the request body.
 */

export type DisputeRatingType = 'general' | 'department';

export interface FileDisputeResult {
  id: string;
}

/**
 * Returns null when the referenced rating doesn't exist, doesn't belong to
 * this hospital, or already has an open dispute (the partial unique index
 * in migration 033 enforces the latter at the DB level; a duplicate insert
 * attempt raises a unique-violation which this catches and treats the same
 * as "already disputed" rather than a 500).
 */
export async function fileDispute(
  hospitalId: string,
  ratingType: DisputeRatingType,
  ratingId: string,
  filedByUserId: string,
  complaint: string,
): Promise<FileDisputeResult | null> {
  const sanitizedComplaint = sanitizeText(complaint, 4000);
  if (!sanitizedComplaint || !sanitizedComplaint.trim()) return null;

  const column = ratingType === 'general' ? 'general_rating_id' : 'department_rating_id';
  const table = ratingType === 'general' ? 'general_ratings' : 'department_ratings';

  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO rating_disputes (hospital_id, ${column}, filed_by_user_id, complaint)
       SELECT $1, $2, $3, $4
       WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = $2 AND hospital_id = $1)
       RETURNING id`,
      [hospitalId, ratingId, filedByUserId, sanitizedComplaint],
    );
    return rows[0] ?? null;
  } catch (err) {
    // Unique-violation on the partial "one open dispute" index -> treat as
    // "already disputed", not a server error.
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      return null;
    }
    throw err;
  }
}

export interface RatingDispute {
  id: string;
  hospital_id: string;
  hospital_name: string;
  general_rating_id: string | null;
  department_rating_id: string | null;
  complaint: string;
  status: 'pending' | 'dismissed' | 'upheld';
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** The dev queue: every still-pending dispute, oldest first. */
export async function listPendingDisputes(): Promise<RatingDispute[]> {
  const { rows } = await query<RatingDispute>(
    `SELECT rd.id, rd.hospital_id, h.name AS hospital_name, rd.general_rating_id, rd.department_rating_id,
            rd.complaint, rd.status, rd.resolution_note, rd.created_at, rd.resolved_at
     FROM rating_disputes rd
     JOIN hospitals h ON h.id = rd.hospital_id
     WHERE rd.status = 'pending'
     ORDER BY rd.created_at ASC`,
  );
  return rows;
}

/** All disputes (any status) for one hospital — used by the hospital's own dashboard. */
export async function listDisputesForHospital(hospitalId: string): Promise<RatingDispute[]> {
  const { rows } = await query<RatingDispute>(
    `SELECT rd.id, rd.hospital_id, h.name AS hospital_name, rd.general_rating_id, rd.department_rating_id,
            rd.complaint, rd.status, rd.resolution_note, rd.created_at, rd.resolved_at
     FROM rating_disputes rd
     JOIN hospitals h ON h.id = rd.hospital_id
     WHERE rd.hospital_id = $1
     ORDER BY rd.created_at DESC`,
    [hospitalId],
  );
  return rows;
}

/**
 * Resolve a pending dispute (dismiss = rating stands and counts again;
 * uphold = rating stays permanently excluded from the aggregate). Either way
 * the hospital's aggregate is recomputed in the SAME transaction, since a
 * status change here directly changes what recomputeHospitalRatingAggregate
 * counts.
 */
export async function resolveDispute(
  disputeId: string,
  devId: string,
  status: 'dismissed' | 'upheld',
  resolutionNote: string | null,
): Promise<{ hospital_id: string } | null> {
  return withTransaction(async (tx: TxClient) => {
    const { rows } = await tx.query<{ hospital_id: string }>(
      `UPDATE rating_disputes
       SET status = $2, resolved_by_dev_id = $3, resolution_note = $4, resolved_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING hospital_id`,
      [disputeId, status, devId, sanitizeText(resolutionNote, 4000)],
    );
    const hospitalId = rows[0]?.hospital_id;
    if (!hospitalId) return null;

    await recomputeHospitalRatingAggregate(hospitalId, tx);
    return { hospital_id: hospitalId };
  });
}

export async function findDisputeById(id: string): Promise<{ id: string; status: string } | null> {
  return queryOne(`SELECT id, status FROM rating_disputes WHERE id = $1`, [id]);
}
