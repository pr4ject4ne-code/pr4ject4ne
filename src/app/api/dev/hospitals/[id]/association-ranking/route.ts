import { getDevUser } from '@/lib/dev-auth';
import { apiError, apiOk, readJson } from '@/lib/api';
import { issueAssociationRanking, clearAssociationRanking, listAssociationRankings } from '@/lib/association-rankings';
import { logAudit, clientIpFrom } from '@/lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET — a hospital's association-ranking history. Any dev. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError('Invalid request.', 'BAD_REQUEST', 400);
  return apiOk(await listAssociationRankings(id));
}

interface Body {
  score?: number;
  statement?: string;
}

/**
 * POST — issue an official association ranking (item 8), typically after
 * reviewing a dispute. Overrides the community-derived score for this
 * hospital's display/ranking/filtering. Any dev, primary or secondary
 * (item 6), fully audit-logged.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError('Invalid request.', 'BAD_REQUEST', 400);

  const body = await readJson<Body>(req);
  const score = body?.score;
  if (typeof score !== 'number' || score < 0 || score > 5) {
    return apiError('score must be a number from 0 to 5.', 'BAD_REQUEST', 400);
  }
  if (!body?.statement?.trim()) {
    return apiError('A released statement is required — this is a public, official ranking.', 'BAD_REQUEST', 400);
  }

  const result = await issueAssociationRanking(id, dev.id, score, body.statement);
  if (!result) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId: dev.id,
    action: 'association_ranking_issued',
    resourceType: 'hospital',
    resourceId: id,
    details: { score, association_ranking_id: result.id },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, id: result.id }, 201);
}

/** DELETE — clear the active override (rare; e.g. issued in error). History
 *  is kept, just stops overriding the community score. Any dev. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError('Invalid request.', 'BAD_REQUEST', 400);

  await clearAssociationRanking(id);
  await logAudit({
    userId: dev.id,
    action: 'association_ranking_cleared',
    resourceType: 'hospital',
    resourceId: id,
    details: {},
    ip: clientIpFrom(_req.headers),
  });
  return apiOk({ success: true });
}
