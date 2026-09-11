/**
 * Tests for POST /api/hospitals/[id]/departments/[departmentId]/ratings —
 * item 8's 3-axis (staff/service/infrastructure) in-depth rating + optional
 * review, replacing the old single `score` body.
 */
import { POST } from '@/app/api/hospitals/[id]/departments/[departmentId]/ratings/route';

const mockGetPatientSession = jest.fn();
const mockSubmitDepartmentRating = jest.fn();
const mockCheckUserRateLimit = jest.fn();
const mockCheckHospitalRateLimit = jest.fn();
const mockLogAudit = jest.fn().mockResolvedValue(undefined);

jest.mock('next/headers', () => ({
  cookies: () => ({ get: () => ({ value: 'session-token' }) }),
}));

jest.mock('@/lib/auth', () => ({
  getPatientSession: (...a: unknown[]) => mockGetPatientSession(...a),
}));

jest.mock('@/lib/audit', () => ({
  logAudit: (...a: unknown[]) => mockLogAudit(...a),
  clientIpFrom: () => null,
}));

jest.mock('@/lib/department-ratings', () => ({
  submitDepartmentRating: (...a: unknown[]) => mockSubmitDepartmentRating(...a),
  checkDepartmentRatingUserRateLimit: (...a: unknown[]) => mockCheckUserRateLimit(...a),
  checkDepartmentRatingHospitalRateLimit: (...a: unknown[]) => mockCheckHospitalRateLimit(...a),
}));

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEPT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FULL_BODY = { staff_score: 4, service_score: 5, infrastructure_score: 3 };

function session(userId: string | null) {
  mockGetPatientSession.mockResolvedValue(userId ? { user_id: userId, account_type: 'patient' } : null);
}

function req(body: unknown, hospitalId = HOSP_ID, departmentId = DEPT_ID): Request {
  return new Request(`http://localhost/api/hospitals/${hospitalId}/departments/${departmentId}/ratings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function call(body: unknown, hospitalId = HOSP_ID, departmentId = DEPT_ID) {
  return POST(req(body, hospitalId, departmentId), {
    params: Promise.resolve({ id: hospitalId, departmentId }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckUserRateLimit.mockResolvedValue(true);
  mockCheckHospitalRateLimit.mockResolvedValue(true);
});

describe('POST /api/hospitals/[id]/departments/[departmentId]/ratings', () => {
  it('400 for a malformed hospital or department id, before touching a session', async () => {
    const res = await call(FULL_BODY, 'not-a-uuid', DEPT_ID);
    expect(res.status).toBe(400);
    expect(mockGetPatientSession).not.toHaveBeenCalled();
  });

  it('401 without a session', async () => {
    session(null);
    const res = await call(FULL_BODY);
    expect(res.status).toBe(401);
  });

  it.each(['staff_score', 'service_score', 'infrastructure_score'])(
    '400 when %s is a non-integer',
    async (field) => {
      session(USER_ID);
      const res = await call({ ...FULL_BODY, [field]: 4.5 });
      expect(res.status).toBe(400);
    },
  );

  it.each(['staff_score', 'service_score', 'infrastructure_score'])('400 when %s is below 1', async (field) => {
    session(USER_ID);
    const res = await call({ ...FULL_BODY, [field]: 0 });
    expect(res.status).toBe(400);
  });

  it.each(['staff_score', 'service_score', 'infrastructure_score'])('400 when %s is above 5', async (field) => {
    session(USER_ID);
    const res = await call({ ...FULL_BODY, [field]: 6 });
    expect(res.status).toBe(400);
  });

  it.each(['staff_score', 'service_score', 'infrastructure_score'])('400 when %s is missing', async (field) => {
    session(USER_ID);
    const body = { ...FULL_BODY };
    delete (body as Record<string, unknown>)[field];
    const res = await call(body);
    expect(res.status).toBe(400);
  });

  it('429 when the per-user bucket is throttled, independent of the hospital bucket', async () => {
    session(USER_ID);
    mockCheckUserRateLimit.mockResolvedValue(false);
    mockCheckHospitalRateLimit.mockResolvedValue(true);
    const res = await call(FULL_BODY);
    expect(res.status).toBe(429);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rate_limited', resourceType: 'department' }),
    );
    expect(mockSubmitDepartmentRating).not.toHaveBeenCalled();
  });

  it('429 when the per-hospital-target bucket is throttled, independent of the user bucket', async () => {
    session(USER_ID);
    mockCheckUserRateLimit.mockResolvedValue(true);
    mockCheckHospitalRateLimit.mockResolvedValue(false);
    const res = await call(FULL_BODY);
    expect(res.status).toBe(429);
    expect(mockSubmitDepartmentRating).not.toHaveBeenCalled();
  });

  it('404 when the department does not belong to the hospital (or the hospital is not approved)', async () => {
    session(USER_ID);
    mockSubmitDepartmentRating.mockResolvedValue(null);
    const res = await call(FULL_BODY);
    expect(res.status).toBe(404);
    expect(mockLogAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'department_rating_submitted' }),
    );
  });

  it('200 happy path — submits all three axes + review and returns the aggregate shape', async () => {
    session(USER_ID);
    mockSubmitDepartmentRating.mockResolvedValue({
      department_avg: 4.5,
      department_count: 2,
      hospital_rating_avg: 4.2,
      hospital_rating_count: 10,
    });

    const res = await call({ ...FULL_BODY, review: 'Great department' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      department_avg: 4.5,
      department_count: 2,
      hospital_rating_avg: 4.2,
      hospital_rating_count: 10,
      your_scores: { staff_score: 4, service_score: 5, infrastructure_score: 3 },
    });
    expect(mockSubmitDepartmentRating).toHaveBeenCalledWith(HOSP_ID, DEPT_ID, USER_ID, {
      staffScore: 4,
      serviceScore: 5,
      infrastructureScore: 3,
      review: 'Great department',
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        action: 'department_rating_submitted',
        resourceType: 'department',
        resourceId: DEPT_ID,
        details: { hospital_id: HOSP_ID, staff_score: 4, service_score: 5, infrastructure_score: 3 },
      }),
    );
  });

  it('resubmit by the same patient updates rather than duplicating (200 both times, same identity params)', async () => {
    session(USER_ID);
    mockSubmitDepartmentRating.mockResolvedValue({
      department_avg: 4,
      department_count: 1,
      hospital_rating_avg: 4,
      hospital_rating_count: 1,
    });

    const first = await call(FULL_BODY);
    expect(first.status).toBe(200);

    mockSubmitDepartmentRating.mockResolvedValue({
      department_avg: 2,
      department_count: 1,
      hospital_rating_avg: 2,
      hospital_rating_count: 1,
    });
    const second = await call({ staff_score: 2, service_score: 2, infrastructure_score: 2 });
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.department_count).toBe(1); // updated, not duplicated
    expect(secondJson.your_scores).toEqual({ staff_score: 2, service_score: 2, infrastructure_score: 2 });
  });
});
