import type { QueryResultRow } from 'pg';
import { combinedHospitalScore } from '@/lib/rating-scoring';

/** Mirrors department-ratings.ts's own TxClient — duplicated rather than
 *  imported to avoid a circular import (that file imports FROM this one). */
export interface TxClient {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: R[] }>;
}

/**
 * Item 8 — the single, shared recompute of `hospitals.rating_avg`/
 * `rating_count` (the community-derived combined score) from BOTH rating
 * tables at once. Every write path that can change a hospital's ratings
 * calls this ONE function afterward, inside the same transaction:
 *  - submitDepartmentRating / submitGeneralRating (a new or updated rating)
 *  - cascadeDeleteRemovedDepartmentRatings (a department was removed)
 *  - resolveRatingDispute (a disputed rating starts/stops counting)
 * Centralizing this avoids four slightly-different reimplementations of the
 * same blend, which is exactly how the old plain-AVG logic and a
 * hypothetical new blended one would drift apart over time.
 *
 * DISPUTE EXCLUSION: a rating with an open ('pending') or 'upheld' dispute
 * against it is excluded from both averages entirely — computed live via
 * NOT EXISTS on every call, never a cached "is this disputed" flag that
 * could fall out of sync with the dispute's actual current status.
 */
export async function recomputeHospitalRatingAggregate(hospitalId: string, tx: TxClient): Promise<void> {
  const { rows: generalRows } = await tx.query<{ avg: string | null; count: string }>(
    `SELECT AVG(g.score)::numeric(4,3) AS avg, COUNT(*)::text AS count
     FROM general_ratings g
     WHERE g.hospital_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM rating_disputes rd
         WHERE rd.general_rating_id = g.id AND rd.status IN ('pending', 'upheld')
       )`,
    [hospitalId],
  );
  const { rows: indepthRows } = await tx.query<{ avg: string | null; count: string }>(
    `SELECT AVG((d.staff_score + d.service_score + d.infrastructure_score) / 3.0)::numeric(4,3) AS avg,
            COUNT(*)::text AS count
     FROM department_ratings d
     WHERE d.hospital_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM rating_disputes rd
         WHERE rd.department_rating_id = d.id AND rd.status IN ('pending', 'upheld')
       )`,
    [hospitalId],
  );

  const generalAvg = generalRows[0]?.avg !== null && generalRows[0]?.avg !== undefined ? Number(generalRows[0].avg) : null;
  const indepthAvg = indepthRows[0]?.avg !== null && indepthRows[0]?.avg !== undefined ? Number(indepthRows[0].avg) : null;
  const combined = combinedHospitalScore(generalAvg, indepthAvg);
  const totalCount = Number(generalRows[0]?.count ?? '0') + Number(indepthRows[0]?.count ?? '0');

  await tx.query(`UPDATE hospitals SET rating_avg = $2, rating_count = $3 WHERE id = $1`, [
    hospitalId,
    combined ?? 0,
    totalCount,
  ]);
}
