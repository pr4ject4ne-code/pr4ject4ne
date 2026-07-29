import { query } from '@/lib/db';
import { apiOk, apiError, parseLimit, parseOffset } from '@/lib/api';
import { getDevUser, isPrimary } from '@/lib/dev-auth';

/** GET — searchable/filterable audit log. **Level-1 (primary) only** — observing
 * devs and system activity is an exclusive primary power. */
export async function GET(req: Request) {
  const dev = await getDevUser();
  if (!dev || !isPrimary(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'), 50, 200);
  const offset = parseOffset(url.searchParams.get('offset'));

  const conditions: string[] = [];
  const params: unknown[] = [];

  const action = url.searchParams.get('action');
  if (action) {
    params.push(action);
    conditions.push(`action_type = $${params.length}`);
  }
  const resourceType = url.searchParams.get('resource_type');
  if (resourceType) {
    params.push(resourceType);
    conditions.push(`resource_type = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count and page fetch are independent — run them in parallel. No count cap
  // here: this endpoint is admin-only, not a public DoS surface.
  const [totalRow, { rows }] = await Promise.all([
    query<{ count: string }>(`SELECT count(*)::text AS count FROM audit_logs ${where}`, params),
    query(
      // Joins users.email so the dashboard can group/label entries by who
      // actually did them (founder ask, 2026-07-29: "neatly organized based
      // on user") instead of an unreadable truncated user_id.
      `SELECT a.id, a.user_id, u.email AS user_email, a.action_type, a.resource_type, a.resource_id,
              a.details, a.ip_address, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where.replace(/\b(action_type|resource_type)\b/g, 'a.$1')}
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ]);
  const total = Number(totalRow.rows[0]?.count ?? '0');

  return apiOk({ logs: rows, total, limit, offset });
}
