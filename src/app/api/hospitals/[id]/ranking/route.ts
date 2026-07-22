import { queryOne } from '@/lib/db';
import { apiError, apiOk } from '@/lib/api';
import { RANKING_QUERY, toHospitalRanking, type RankingQueryRow } from '@/lib/hospital-ranking';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/hospitals/[id]/ranking — this hospital's rating rank within its
 * `city` (region) and nationally, among `status = 'approved'` hospitals.
 *
 * Kept as its own endpoint (not folded into GET /api/hospitals/[id]) on
 * purpose: the base profile route is a cheap, single-row lookup that should
 * stay fast on every page view, while this ranking query runs window
 * functions over every approved hospital (city-partitioned + global). At
 * today's scale that's still a single index-friendly pass, but it's a
 * fundamentally different cost profile that shouldn't be forced onto every
 * profile-page load — the client fetches it separately (and could later be
 * cached/recomputed on a schedule instead of per-request without touching the
 * profile route at all).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return apiError('Hospital not found.', 'NOT_FOUND', 404);
  }

  const row = await queryOne<RankingQueryRow>(RANKING_QUERY, [id]);
  if (!row) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  return apiOk(toHospitalRanking(row));
}
