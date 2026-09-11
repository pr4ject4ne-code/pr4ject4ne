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
  staff_score?: number;
  service_score?: number;
  infrastructure_score?: number;
  review?: string;
}

function isValidScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * POST /api/hospitals/[id]/departments/[departmentId]/ratings — the
 * "in-depth" rating (item 8): one patient's 3-axis rating (staff/individuals,
 * service, infrastructure) of one department, plus an optional written
 * review. Open rating for v1: any authenticated patient, no
 * visit-verification. A resubmission by the same patient for the same
 * department updates their existing scores rather than creating a duplicate.
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
  if (!body || !isValidScore(body.staff_score) || !isValidScore(body.service_score) || !isValidScore(body.infrastructure_score)) {
    return apiError('staff_score, service_score, and infrastructure_score must each be an integer from 1 to 5.', 'BAD_REQUEST', 400);
  }

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

  const result = await submitDepartmentRating(hospitalId, departmentId, session.user_id, {
    staffScore: body.staff_score,
    serviceScore: body.service_score,
    infrastructureScore: body.infrastructure_score,
    review: body.review,
  });
  if (!result) return apiError('Department not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId: session.user_id,
    action: 'department_rating_submitted',
    resourceType: 'department',
    resourceId: departmentId,
    details: {
      hospital_id: hospitalId,
      staff_score: body.staff_score,
      service_score: body.service_score,
      infrastructure_score: body.infrastructure_score,
    },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({
    success: true,
    department_avg: result.department_avg,
    department_count: result.department_count,
    hospital_rating_avg: result.hospital_rating_avg,
    hospital_rating_count: result.hospital_rating_count,
    your_scores: {
      staff_score: body.staff_score,
      service_score: body.service_score,
      infrastructure_score: body.infrastructure_score,
    },
  });
}
