import { query } from '@/lib/db';
import { apiOk, apiError } from '@/lib/api';
import { getDevUser, isAdmin } from '@/lib/dev-auth';
import type { FirstAidEntry } from '@/types';

/**
 * GET — entries for the developer portal management view. A developer sees their
 * own entries (editable); admins see all. Entries by other devs are read-only
 * (enforced at PATCH/DELETE).
 */
export async function GET() {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const rows = isAdmin(dev)
    ? (await query<FirstAidEntry>(`SELECT * FROM first_aid_entries ORDER BY updated_at DESC`)).rows
    : (
        await query<FirstAidEntry>(
          `SELECT * FROM first_aid_entries WHERE created_by_dev_id = $1 ORDER BY updated_at DESC`,
          [dev.id],
        )
      ).rows;

  return apiOk({ entries: rows, dev_id: dev.id, is_admin: isAdmin(dev) });
}
