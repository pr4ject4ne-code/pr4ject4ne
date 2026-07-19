import { query } from '@/lib/db';
import { apiOk, apiError, parseLimit, parseOffset } from '@/lib/api';
import { getDevUser, isPrimary } from '@/lib/dev-auth';
import type { FirstAidEntry } from '@/types';

/**
 * GET — entries for the developer portal management view. Both developer levels
 * (primary + secondary) manage the First Aid catalog, so any developer sees all
 * entries and may edit/delete any (enforced at PATCH/DELETE). created_by_dev_id
 * is kept for attribution only.
 *
 * Paginated (bounded) so the query can't grow unbounded as the catalog does; the
 * default page is generous since this is the internal management list, not public.
 */
export async function GET(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get('limit'), 100, 200);
  const offset = parseOffset(searchParams.get('offset'));

  const [{ rows }, countRes] = await Promise.all([
    query<FirstAidEntry>(
      `SELECT * FROM first_aid_entries ORDER BY updated_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    query<{ count: string }>(`SELECT count(*)::text AS count FROM first_aid_entries`),
  ]);

  return apiOk({
    entries: rows,
    total: Number(countRes.rows[0]?.count ?? '0'),
    limit,
    offset,
    dev_id: dev.id,
    is_primary: isPrimary(dev),
  });
}
