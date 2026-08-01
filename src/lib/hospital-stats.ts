/**
 * Homepage trust stats: how many hospitals are actually developer/admin
 * *verified* (not just "approved" — any moderator-approved listing can be
 * unverified community-managed data), and how many distinct cities those
 * verified hospitals span. `verified` is only ever set via
 * /api/dev/tertiary or /api/dev/hospitals by an authenticated developer, and
 * every such action is already audit-logged (`hospital_approved`) — this
 * module just reads the resulting state, it doesn't add any new trust
 * mechanism.
 *
 * Deliberately a SEPARATE, unfiltered aggregate from the paginated directory
 * query in GET /api/hospitals — a symptom/name search narrowing `hospitals`
 * must never make this stat wrong, zero, or missing. Single query (two
 * scalar subqueries) since this table is small (a handful of rows, not
 * millions); no COUNT_CAP subquery-limit pattern needed here, unlike the
 * paginated `total` count in route.ts which exists specifically to bound an
 * unauthenticated, arbitrarily-filtered COUNT(*).
 */

/** Raw shape returned by VERIFIED_STATS_QUERY (always exactly one row). */
export interface VerifiedStatsRow {
  verified_count: string | number;
  city_count: string | number;
}

export interface VerifiedStats {
  verified_count: number;
  city_count: number;
}

export const VERIFIED_STATS_QUERY = `
  SELECT
    (SELECT COUNT(*) FROM hospitals
       WHERE verified = TRUE AND status = 'approved') AS verified_count,
    (SELECT COUNT(DISTINCT city) FROM hospitals
       WHERE verified = TRUE AND status = 'approved'
         AND city IS NOT NULL AND city <> '') AS city_count
`;

/** Turn a raw query row into the typed, numeric stats payload the API returns. */
export function toVerifiedStats(row: VerifiedStatsRow | undefined): VerifiedStats {
  return {
    verified_count: Number(row?.verified_count ?? 0),
    city_count: Number(row?.city_count ?? 0),
  };
}
