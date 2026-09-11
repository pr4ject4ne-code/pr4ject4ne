import { requireHospitalOwnership } from '@/lib/hospital-auth';
import { apiError, apiOk, readJson } from '@/lib/api';
import { fileDispute, listDisputesForHospital } from '@/lib/rating-disputes';
import { logAudit, clientIpFrom } from '@/lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET — a hospital's own dispute history (own hospital only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireHospitalOwnership(id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);
  return apiOk(await listDisputesForHospital(id));
}

interface Body {
  rating_type?: 'general' | 'department';
  rating_id?: string;
  complaint?: string;
}

/**
 * POST — file a dispute against one of this hospital's own ratings as
 * unfair (item 8). Own hospital only; a dev then reviews it
 * (/api/dev/rating-disputes) and can issue an association ranking.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireHospitalOwnership(id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<Body>(req);
  if (
    !body ||
    (body.rating_type !== 'general' && body.rating_type !== 'department') ||
    !body.rating_id ||
    !UUID_RE.test(body.rating_id) ||
    !body.complaint?.trim()
  ) {
    return apiError('rating_type, rating_id, and complaint are all required.', 'BAD_REQUEST', 400);
  }

  const result = await fileDispute(id, body.rating_type, body.rating_id, staff.userId, body.complaint);
  if (!result) {
    return apiError(
      "Couldn't file that dispute — check the rating belongs to your hospital and doesn't already have an open dispute.",
      'BAD_REQUEST',
      400,
    );
  }

  await logAudit({
    userId: staff.userId,
    action: 'rating_dispute_filed',
    resourceType: 'rating_dispute',
    resourceId: result.id,
    details: { rating_type: body.rating_type, rating_id: body.rating_id },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ id: result.id }, 201);
}
