import { getDevUser } from '@/lib/dev-auth';
import { apiError, apiOk, readJson } from '@/lib/api';
import { listPendingDisputes, resolveDispute, findDisputeById } from '@/lib/rating-disputes';
import { logAudit, clientIpFrom } from '@/lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET — the dev queue of pending rating disputes. Any dev, primary or
 *  secondary (item 6 — this manages hospital/user-generated content, not
 *  other developer accounts). */
export async function GET() {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);
  return apiOk(await listPendingDisputes());
}

interface Body {
  id?: string;
  status?: 'dismissed' | 'upheld';
  resolution_note?: string;
}

/**
 * PATCH — resolve a pending dispute. 'dismissed' lets the disputed rating
 * count again immediately; 'upheld' excludes it from the hospital's
 * aggregate permanently (both take effect via a live recompute, item 8).
 */
export async function PATCH(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<Body>(req);
  if (!body || !body.id || !UUID_RE.test(body.id) || (body.status !== 'dismissed' && body.status !== 'upheld')) {
    return apiError('id and a valid status (dismissed or upheld) are required.', 'BAD_REQUEST', 400);
  }

  const existing = await findDisputeById(body.id);
  if (!existing) return apiError('Dispute not found.', 'NOT_FOUND', 404);
  if (existing.status !== 'pending') return apiError('This dispute has already been resolved.', 'ALREADY_RESOLVED', 400);

  const result = await resolveDispute(body.id, dev.id, body.status, body.resolution_note ?? null);
  if (!result) return apiError('Dispute not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId: dev.id,
    action: 'rating_dispute_resolved',
    resourceType: 'rating_dispute',
    resourceId: body.id,
    details: { status: body.status, hospital_id: result.hospital_id },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}
