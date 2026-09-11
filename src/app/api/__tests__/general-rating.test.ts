import { POST } from '@/app/api/hospitals/[id]/general-rating/route';

const mockGetPatientSession = jest.fn();
const mockSubmitGeneralRating = jest.fn();
const mockCheckUserRateLimit = jest.fn();
const mockCheckHospitalRateLimit = jest.fn();
const mockLogAudit = jest.fn().mockResolvedValue(undefined);

jest.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'token' }) }) }));
jest.mock('@/lib/auth', () => ({ getPatientSession: (...a: unknown[]) => mockGetPatientSession(...a) }));
jest.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => mockLogAudit(...a), clientIpFrom: () => null }));
jest.mock('@/lib/general-ratings', () => ({
  submitGeneralRating: (...a: unknown[]) => mockSubmitGeneralRating(...a),
  checkGeneralRatingUserRateLimit: (...a: unknown[]) => mockCheckUserRateLimit(...a),
  checkGeneralRatingHospitalRateLimit: (...a: unknown[]) => mockCheckHospitalRateLimit(...a),
}));

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function call(body: unknown, hospitalId = HOSP_ID) {
  const req = new Request(`http://localhost/api/hospitals/${hospitalId}/general-rating`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id: hospitalId }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckUserRateLimit.mockResolvedValue(true);
  mockCheckHospitalRateLimit.mockResolvedValue(true);
});

describe('POST /api/hospitals/[id]/general-rating', () => {
  it('400 for an invalid hospital id', async () => {
    const res = await call({ score: 4 }, 'not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('401 without a session', async () => {
    mockGetPatientSession.mockResolvedValue(null);
    const res = await call({ score: 4 });
    expect(res.status).toBe(401);
  });

  it('400 for an out-of-range score', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
    const res = await call({ score: 6 });
    expect(res.status).toBe(400);
  });

  it('429 when rate-limited', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
    mockCheckUserRateLimit.mockResolvedValue(false);
    const res = await call({ score: 4 });
    expect(res.status).toBe(429);
  });

  it('404 when the hospital is not found/approved', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
    mockSubmitGeneralRating.mockResolvedValue(null);
    const res = await call({ score: 4 });
    expect(res.status).toBe(404);
  });

  it('200 happy path, audit-logged', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
    mockSubmitGeneralRating.mockResolvedValue({
      general_avg: 4.5,
      general_count: 2,
      hospital_rating_avg: 4.2,
      hospital_rating_count: 10,
    });
    const res = await call({ score: 5, review: 'Great hospital' });
    expect(res.status).toBe(200);
    expect(mockSubmitGeneralRating).toHaveBeenCalledWith(HOSP_ID, USER_ID, 5, 'Great hospital');
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'general_rating_submitted' }));
  });
});
