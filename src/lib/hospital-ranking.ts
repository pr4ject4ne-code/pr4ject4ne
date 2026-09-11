/**
 * Hospital rating rankings (worklist #2): region (grouped by the hospital's own
 * free-text `city` value) and national (all approved hospitals) standing.
 *
 * Scope decision: the "world" tier from the original ask is DROPPED for v1 —
 * this is a single-country (Nigeria) app, so a global tier doesn't map to
 * anything real yet. Region + national only.
 *
 * Data-quality caveat: `city` is free text (no normalized region/state field),
 * so region grouping is only as good as how consistently hospitals typed their
 * city — typos/variants (e.g. "Enugu" vs "enugu " vs "Enugu City") will silently
 * fragment a region into multiple groups. Not solved here; flagging for when a
 * normalized region/state field exists.
 */

/** Raw shape returned by the ranking SQL query (one row per hospital id). */
export interface RankingQueryRow {
  rating_avg: string | number;
  rating_count: string | number;
  association_score: string | number | null;
  region_rank: string | number | null;
  region_total: string | number | null;
  national_rank: string | number | null;
  national_total: string | number | null;
}

export interface RankTier {
  rank: number;
  total: number;
}

export interface HospitalRanking {
  /** The community-derived blended score (general + in-depth, item 8's
   *  1.8x-weighted formula) — always present, always shown for transparency
   *  even when an association ranking overrides it for actual ranking. */
  rating_avg: number;
  rating_count: number;
  /** An admin-issued official score (item 8), when one has been issued.
   *  OVERRIDES rating_avg for the rank/total figures below, but never
   *  replaces rating_avg itself in the response — the UI shows both. */
  association_score: number | null;
  /** null when the hospital isn't `status = 'approved'` (not eligible to be ranked). */
  region: RankTier | null;
  national: RankTier | null;
}

/**
 * The single query used by GET /api/hospitals/[id]/ranking. Computes rank +
 * group size for both tiers via window functions over `status = 'approved'`
 * hospitals only, in one pass — no N+1. `RANK()` (not `ROW_NUMBER()`) ties
 * hospitals with identical avg+count+name is impossible since `name` is the
 * final, deterministic tie-break, but `RANK()` reads more naturally than
 * `ROW_NUMBER()` for a "position among peers" figure a user sees.
 *
 * Item 8: ranking orders on `COALESCE(association_score, rating_avg)` — an
 * admin-issued association ranking overrides the community blend for WHERE
 * a hospital lands, exactly like it overrides sorting/filtering elsewhere
 * (hospital-filters.ts). The raw rating_avg is still selected separately so
 * the response (and the hospital page) can show both figures.
 *
 * The outer query is a plain hospital lookup LEFT JOINed to the ranked CTE, so:
 *  - a non-existent id returns no row (caller 404s)
 *  - a non-approved hospital returns a row with all the `r.*` ranking columns
 *    NULL (still has rating_avg/rating_count from the hospital row itself)
 */
export const RANKING_QUERY = `
  SELECT h.rating_avg, h.rating_count, h.association_score,
         r.region_rank, r.region_total, r.national_rank, r.national_total
  FROM hospitals h
  LEFT JOIN (
    SELECT id,
           RANK() OVER (
             PARTITION BY city ORDER BY COALESCE(association_score, rating_avg) DESC, rating_count DESC, name ASC
           ) AS region_rank,
           COUNT(*) OVER (PARTITION BY city) AS region_total,
           RANK() OVER (
             ORDER BY COALESCE(association_score, rating_avg) DESC, rating_count DESC, name ASC
           ) AS national_rank,
           COUNT(*) OVER () AS national_total
    FROM hospitals
    WHERE status = 'approved'
  ) r ON r.id = h.id
  WHERE h.id = $1
`;

/** Turn a raw query row into the typed, numeric ranking payload the API returns. */
export function toHospitalRanking(row: RankingQueryRow): HospitalRanking {
  const num = (v: string | number | null): number | null => (v === null ? null : Number(v));
  const regionRank = num(row.region_rank);
  const regionTotal = num(row.region_total);
  const nationalRank = num(row.national_rank);
  const nationalTotal = num(row.national_total);
  return {
    rating_avg: Number(row.rating_avg),
    rating_count: Number(row.rating_count),
    association_score: num(row.association_score),
    region: regionRank !== null && regionTotal !== null ? { rank: regionRank, total: regionTotal } : null,
    national:
      nationalRank !== null && nationalTotal !== null
        ? { rank: nationalRank, total: nationalTotal }
        : null,
  };
}
