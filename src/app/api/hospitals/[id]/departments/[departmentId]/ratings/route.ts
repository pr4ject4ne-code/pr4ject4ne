import { cookies } from 'next/headers';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getPatientSession } from '@/lib/auth';
import { logAudit, clientIpFrom } from '@/lib/audit';
import {
  submitDepartmentRating,
  checkDepartmentRatingUserRateLimit,
  checkDepartmentRatingHospitalRateLimit,
} from '@/lib/department-ratings';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body {
  score?: number;
}

/**
 * POST /api/hospitals/[id]/departments/[departmentId]/ratings — rate one
 * department of one hospital as the calling patient. Open rating for v1: any
 * authenticated patient, no visit-verification. A resubmission by the same
 * patient for the same department updates their existing score rather than
 * creating a duplicate (see submitDepartmentRating's upsert).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; departmentId: string }> },
) {
  const { id: hospitalId, departmentId } = await params;
  if (!UUID_RE.test(hospitalId) || !UUID_RE.test(departmentId)) {
    return apiError('Invalid request.', 'BAD_REQUEST', 400);
  }

  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);
  if (!session) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const body = await readJson<Body>(req);
  const score = body?.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
    return apiError('score must be an integer from 1 to 5.', 'BAD_REQUEST', 400);
  }

  // Two independent buckets — either tripping is a 429, logged for
  // brute-force/abuse visibility (mirrors the rate-limit-then-audit pattern
  // used elsewhere, e.g. biodata shared reads).
  const userAllowed = await checkDepartmentRatingUserRateLimit(session.user_id);
  const hospitalAllowed = await checkDepartmentRatingHospitalRateLimit(hospitalId);
  if (!userAllowed || !hospitalAllowed) {
    await logAudit({
      userId: session.user_id,
      action: 'rate_limited',
      resourceType: 'department',
      resourceId: departmentId,
      details: { endpoint: 'department_rating', hospital_id: hospitalId },
      ip: clientIpFrom(req.headers),
    });
    return apiError('Too many ratings submitted. Try again later.', 'RATE_LIMITED', 429);
  }

  const result = await submitDepartmentRating(hospitalId, departmentId, session.user_id, score);
  if (!result) return apiError('Department not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId: session.user_id,
    action: 'department_rating_submitted',
    resourceType: 'department',
    resourceId: departmentId,
    details: { hospital_id: hospitalId, score },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({
    success: true,
    department_avg: result.department_avg,
    department_count: result.department_count,
    hospital_rating_avg: result.hospital_rating_avg,
    hospital_rating_count: result.hospital_rating_count,
    your_score: score,
  });
}
