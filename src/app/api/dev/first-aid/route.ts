import { query } from '@/lib/db';
import { apiOk, apiError } from '@/lib/api';
import { getDevUser, isPrimary } from '@/lib/dev-auth';
import type { FirstAidEntry } from '@/types';

/**
 * GET — entries for the developer portal management view. Both developer levels
 * (primary + secondary) manage the First Aid catalog, so any developer sees all
 * entries and may edit/delete any (enforced at PATCH/DELETE). created_by_dev_id
 * is kept for attribution only.
 */
export async function GET() {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const { rows } = await query<FirstAidEntry>(
    `SELECT * FROM first_aid_entries ORDER BY updated_at DESC`,
  );

  return apiOk({ entries: rows, dev_id: dev.id, is_primary: isPrimary(dev), can_edit_all: true });
}
