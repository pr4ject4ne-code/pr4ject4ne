import { query, queryOne } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getDevUser, isAdmin } from '@/lib/dev-auth';
import { sanitizeText, safeHttpUrl } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';
import type { FirstAidEntry, FirstAidCategory } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES: FirstAidCategory[] = ['procedure', 'technique'];
const TEXT_FIELDS = [
  'definition',
  'description',
  'process',
  'dos',
  'donts',
  'things_to_look_out_for',
  'implications',
  'indication',
  'contraindications',
] as const;

/** GET — public single entry (detail page). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const entry = await queryOne<FirstAidEntry>(`SELECT * FROM first_aid_entries WHERE id = $1`, [
    params.id,
  ]);
  if (!entry) return apiError('Not found.', 'NOT_FOUND', 404);
  return apiOk({ entry });
}

/** PATCH — developer only; a dev may edit their own entries (admins edit any). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const entry = await queryOne<FirstAidEntry>(
    `SELECT created_by_dev_id FROM first_aid_entries WHERE id = $1`,
    [params.id],
  );
  if (!entry) return apiError('Not found.', 'NOT_FOUND', 404);
  if (entry.created_by_dev_id !== dev.id && !isAdmin(dev)) {
    return apiError('You can only edit entries you created.', 'FORBIDDEN', 403);
  }

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const sets: string[] = [];
  const cols: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown, cast = '') => {
    values.push(val);
    cols.push(col);
    sets.push(`${col} = $${values.length}${cast}`);
  };

  if (typeof body.title === 'string') {
    const t = sanitizeText(body.title, 300);
    if (t && t.trim()) push('title', t);
  }
  if (CATEGORIES.includes(body.category as FirstAidCategory)) push('category', body.category);
  for (const f of TEXT_FIELDS) {
    if (f in body) push(f, sanitizeText(body[f]));
  }
  if (Array.isArray(body.images)) {
    const imgs = body.images.map((u) => safeHttpUrl(u)).filter((u): u is string => Boolean(u)).slice(0, 10);
    push('images', JSON.stringify(imgs), '::jsonb');
  }

  if (sets.length === 0) return apiError('Nothing to update.', 'BAD_REQUEST', 400);

  values.push(params.id);
  await query(
    `UPDATE first_aid_entries SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${values.length}`,
    values,
  );

  await logAudit({
    userId: dev.id,
    action: 'first_aid_edit',
    resourceType: 'first_aid_entry',
    resourceId: params.id,
    details: { fields: cols },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}

/** DELETE — developer only; own entries (admins delete any). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const entry = await queryOne<FirstAidEntry>(
    `SELECT created_by_dev_id FROM first_aid_entries WHERE id = $1`,
    [params.id],
  );
  if (!entry) return apiError('Not found.', 'NOT_FOUND', 404);
  if (entry.created_by_dev_id !== dev.id && !isAdmin(dev)) {
    return apiError('You can only delete entries you created.', 'FORBIDDEN', 403);
  }

  await query('DELETE FROM first_aid_entries WHERE id = $1', [params.id]);
  await logAudit({
    userId: dev.id,
    action: 'first_aid_delete',
    resourceType: 'first_aid_entry',
    resourceId: params.id,
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}
