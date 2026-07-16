import { query } from '@/lib/db';
import { apiOk, parseLimit, parseOffset } from '@/lib/api';
import { escapeLikePattern } from '@/lib/sanitize';
import { isFirstAidTag } from '@/lib/first-aid-tags';
import type { FirstAidEntry, FirstAidCategory } from '@/types';

const CATEGORIES: FirstAidCategory[] = ['procedure', 'technique'];

/**
 * Cap for the catalog COUNT(*): public unauthenticated endpoint, so the count
 * is bounded to keep arbitrary-filter counting cheap. Exact below the cap.
 */
const COUNT_CAP = 500;

/**
 * GET /api/first-aid/entries — public, paginated catalog.
 * Query params: category (procedure|technique), q (search), limit, offset.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = parseOffset(url.searchParams.get('offset'));

  const conditions: string[] = [];
  const params: unknown[] = [];

  const category = url.searchParams.get('category');
  if (category && CATEGORIES.includes(category as FirstAidCategory)) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  // Topic/scenario tag filter (whitelisted). `tags @> ARRAY[tag]` uses the GIN index.
  const tag = url.searchParams.get('tag');
  if (tag && isFirstAidTag(tag)) {
    params.push([tag]);
    conditions.push(`tags @> $${params.length}::text[]`);
  }

  const q = url.searchParams.get('q');
  if (q) {
    params.push(`%${escapeLikePattern(q)}%`);
    const n = params.length;
    // Search across all the substantive content fields (and the tags), not just
    // title/definition, so a term that only appears in the steps/indications/tags
    // still matches. The catalog is small and dev-curated, so a multi-column
    // ILIKE is cheap.
    conditions.push(
      `(title ILIKE $${n} ESCAPE '\\' OR definition ILIKE $${n} ESCAPE '\\' ` +
        `OR description ILIKE $${n} ESCAPE '\\' OR process ILIKE $${n} ESCAPE '\\' ` +
        `OR indication ILIKE $${n} ESCAPE '\\' OR contraindications ILIKE $${n} ESCAPE '\\' ` +
        `OR things_to_look_out_for ILIKE $${n} ESCAPE '\\' ` +
        `OR array_to_string(tags, ' ') ILIKE $${n} ESCAPE '\\')`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count and page fetch are independent — run them in parallel. The count is
  // bounded by COUNT_CAP (see above) via a LIMITed subquery.
  const [totalRow, { rows }] = await Promise.all([
    query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM (SELECT 1 FROM first_aid_entries ${where} LIMIT ${COUNT_CAP}) t`,
      params,
    ),
    query<FirstAidEntry>(
      `SELECT id, category, title, definition, description, process, dos, donts,
              things_to_look_out_for, implications, indication, contraindications,
              images, tags, created_by_dev_id, created_at, updated_at
       FROM first_aid_entries ${where}
       ORDER BY title ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ]);
  const total = Number(totalRow.rows[0]?.count ?? '0');

  return apiOk({ entries: rows, total, limit, offset });
}
