import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { apiError, apiOk } from '@/lib/api';
import { getPatientSession } from '@/lib/auth';
import { logAudit, clientIpFrom } from '@/lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireOwner() {
  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);
  return session?.user_id ?? null;
}

/**
 * DELETE — remove one of the caller's own reminders. The WHERE clause scopes
 * on BOTH id and user_id in a single statement (not a separate ownership
 * lookup) so a reminder belonging to a different patient simply matches zero
 * rows — same "404 on zero rows" shape used elsewhere for owned resources,
 * which avoids confirming to a caller whether a given id exists at all under
 * another account.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireOwner();
  if (!userId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError('Not found.', 'NOT_FOUND', 404);

  const { rowCount } = await query(`DELETE FROM reminders WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
  if (!rowCount) return apiError('Not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId,
    action: 'reminder_change',
    resourceType: 'reminder',
    resourceId: id,
    details: { op: 'delete' },
    ip: clientIpFrom(_req.headers),
  });

  return apiOk({ success: true });
}
