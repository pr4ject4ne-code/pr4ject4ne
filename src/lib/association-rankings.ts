import { query, withTransaction } from '@/lib/db';
import { sanitizeText } from '@/lib/sanitize';
import type { TxClient } from '@/lib/hospital-rating-aggregate';

/**
 * Item 8 — an official "association ranking": a developer (acting in the
 * reviewing-association capacity — no separate account type, per the
 * founder's direction) issues a score + a released statement for a hospital,
 * typically following a dispute. This OVERRIDES the community-derived
 * combined score for ranking/filtering/display (see rating-scoring.ts's
 * effectiveHospitalScore) while the community numbers stay visible
 * underneath for transparency.
 *
 * Append-only (migration 034's header) — issuing a new one doesn't erase
 * the last; `hospitals.association_score` is a denormalized cache of
 * whichever is most recent, kept in sync here at write time (same pattern
 * as `hospitals.rating_avg` itself).
 */

export interface IssueAssociationRankingResult {
  id: string;
  score: number;
}

export async function issueAssociationRanking(
  hospitalId: string,
  devId: string,
  score: number,
  statement: string,
): Promise<IssueAssociationRankingResult | null> {
  const sanitizedStatement = sanitizeText(statement, 8000);
  if (!sanitizedStatement || !sanitizedStatement.trim()) return null;

  return withTransaction(async (tx: TxClient) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO association_rankings (hospital_id, score, statement, issued_by_dev_id)
       SELECT $1, $2, $3, $4
       WHERE EXISTS (SELECT 1 FROM hospitals WHERE id = $1)
       RETURNING id`,
      [hospitalId, score, sanitizedStatement, devId],
    );
    const id = rows[0]?.id;
    if (!id) return null;

    await tx.query(`UPDATE hospitals SET association_score = $2 WHERE id = $1`, [hospitalId, score]);
    return { id, score };
  });
}

/**
 * Clears the hospital's association ranking override (rare — e.g. issued in
 * error), reverting display/ranking back to the plain community blend.
 * Does NOT delete history — it just stops overriding.
 */
export async function clearAssociationRanking(hospitalId: string): Promise<void> {
  await query(`UPDATE hospitals SET association_score = NULL WHERE id = $1`, [hospitalId]);
}

export interface AssociationRanking {
  id: string;
  score: number;
  statement: string;
  issued_by_dev_id: string | null;
  created_at: string;
}

/** Full history, most recent first — the hospital page shows only the
 *  latest (== hospitals.association_score), but the dev tool needs the
 *  history to show past statements weren't silently erased. */
export async function listAssociationRankings(hospitalId: string): Promise<AssociationRanking[]> {
  const { rows } = await query<AssociationRanking>(
    `SELECT id, score, statement, issued_by_dev_id, created_at
     FROM association_rankings WHERE hospital_id = $1 ORDER BY created_at DESC`,
    [hospitalId],
  );
  return rows;
}
