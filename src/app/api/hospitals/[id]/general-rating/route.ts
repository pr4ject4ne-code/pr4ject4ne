import { cookies } from 'next/headers';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getPatientSession } from '@/lib/auth';
import { logAudit, clientIpFrom } from '@/lib/audit';
import {
  submitGeneralRating,
  checkGeneralRatingUserRateLimit,
  checkGeneralRatingHospitalRateLimit,
} from '@/lib/general-ratings';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body {
  score?: number;
  review?: string;
}

/**
 * POST /api/hospitals/[id]/general-rating — the "general" (overall,
 * per-hospital) rating (item 8), separate from the per-department in-depth
 * breakdown. Open rating for v1: any authenticated patient, no
 * visit-verification. A resubmission updates the patient's existing rating.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: hospitalId } = await params;
  if (!UUID_RE.test(hospitalId)) return apiError('Invalid request.', 'BAD_REQUEST', 400);

  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);
  if (!session) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const body = await readJson<Body>(req);
  const score = body?.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
    return apiError('score must be an integer from 1 to 5.', 'BAD_REQUEST', 400);
  }

  const userAllowed = await checkGeneralRatingUserRateLimit(session.user_id);
  const hospitalAllowed = await checkGeneralRatingHospitalRateLimit(hospitalId);
  if (!userAllowed || !hospitalAllowed) {
    await logAudit({
      userId: session.user_id,
      action: 'rate_limited',
      resourceType: 'hospital',
      resourceId: hospitalId,
      details: { endpoint: 'general_rating' },
      ip: clientIpFrom(req.headers),
    });
    return apiError('Too many ratings submitted. Try again later.', 'RATE_LIMITED', 429);
  }

  const result = await submitGeneralRating(hospitalId, session.user_id, score, body?.review ?? null);
  if (!result) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId: session.user_id,
    action: 'general_rating_submitted',
    resourceType: 'hospital',
    resourceId: hospitalId,
    details: { score },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({
    success: true,
    general_avg: result.general_avg,
    general_count: result.general_count,
    hospital_rating_avg: result.hospital_rating_avg,
    hospital_rating_count: result.hospital_rating_count,
    your_score: score,
  });
}
