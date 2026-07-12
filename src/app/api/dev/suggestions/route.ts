import { query } from '@/lib/db';
import { apiOk, apiError, readJson, parseLimit, parseOffset } from '@/lib/api';
import { getDevUser } from '@/lib/dev-auth';
import { logAudit, clientIpFrom } from '@/lib/audit';
import type { SuggestionStatus } from '@/types';

const STATUSES: SuggestionStatus[] = ['new', 'reviewed', 'applied', 'dismissed'];

/** GET — all suggestions (developer only), optional status filter. */
export async function GET(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'), 50, 200);
  const offset = parseOffset(url.searchParams.get('offset'));
  const status = url.searchParams.get('status');

  const params: unknown[] = [];
  let where = '';
  if (status && STATUSES.includes(status as SuggestionStatus)) {
    params.push(status);
    where = `WHERE s.status = $${params.length}`;
  }

  const totalRow = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM suggestions s ${where}`,
    params,
  );
  const total = Number(totalRow.rows[0]?.count ?? '0');

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT s.*, h.name AS hospital_name
     FROM suggestions s
     LEFT JOIN hospitals h ON h.id = s.hospital_id
     ${where}
     ORDER BY s.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return apiOk({ suggestions: rows, total, limit, offset });
}

interface PatchBody {
  id?: string;
  status?: SuggestionStatus;
}

/** PATCH — update a suggestion's status (developer only). */
export async function PATCH(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<PatchBody>(req);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !body ||
    !body.id ||
    !UUID_RE.test(body.id) ||
    !STATUSES.includes(body.status as SuggestionStatus)
  ) {
    return apiError('Invalid request.', 'BAD_REQUEST', 400);
  }

  const { rowCount } = await query(
    `UPDATE suggestions
     SET status = $2, reviewed_by_dev_id = $3, reviewed_at = now()
     WHERE id = $1`,
    [body.id, body.status, dev.id],
  );
  if (!rowCount) return apiError('Suggestion not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId: dev.id,
    action: 'suggestion_review',
    resourceType: 'suggestion',
    resourceId: body.id,
    details: { status: body.status },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}
