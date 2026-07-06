import { query } from '@/lib/db';
import { apiOk, parseLimit, parseOffset } from '@/lib/api';
import { escapeLikePattern } from '@/lib/sanitize';
import type { FirstAidEntry, FirstAidCategory } from '@/types';

const CATEGORIES: FirstAidCategory[] = ['procedure', 'technique'];

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

  const q = url.searchParams.get('q');
  if (q) {
    params.push(`%${escapeLikePattern(q)}%`);
    conditions.push(
      `(title ILIKE $${params.length} ESCAPE '\\' OR definition ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM first_aid_entries ${where}`,
    params,
  );
  const total = Number(totalRow.rows[0]?.count ?? '0');

  params.push(limit, offset);
  const { rows } = await query<FirstAidEntry>(
    `SELECT id, category, title, definition, description, process, dos, donts,
            things_to_look_out_for, implications, indication, contraindications,
            images, created_by_dev_id, created_at, updated_at
     FROM first_aid_entries ${where}
     ORDER BY title ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return apiOk({ entries: rows, total, limit, offset });
}
