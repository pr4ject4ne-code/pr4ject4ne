import { GET, POST } from '@/app/api/hospital/[id]/rating-disputes/route';

const mockRequireHospitalOwnership = jest.fn();
const mockFileDispute = jest.fn();
const mockListDisputesForHospital = jest.fn();
const mockLogAudit = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/hospital-auth', () => ({
  requireHospitalOwnership: (...a: unknown[]) => mockRequireHospitalOwnership(...a),
}));
jest.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => mockLogAudit(...a), clientIpFrom: () => null }));
jest.mock('@/lib/rating-disputes', () => ({
  fileDispute: (...a: unknown[]) => mockFileDispute(...a),
  listDisputesForHospital: (...a: unknown[]) => mockListDisputesForHospital(...a),
}));

const HOSP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RATING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF = { userId: 'staff1', hospitalId: HOSP_ID };

function postReq(body: unknown): Request {
  return new Request(`http://localhost/api/hospital/${HOSP_ID}/rating-disputes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/hospital/[id]/rating-disputes', () => {
  it('403 when not this hospital\'s own staff', async () => {
    mockRequireHospitalOwnership.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(403);
  });

  it('200 for the hospital\'s own staff', async () => {
    mockRequireHospitalOwnership.mockResolvedValue(STAFF);
    mockListDisputesForHospital.mockResolvedValue([]);
    const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: HOSP_ID }) });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/hospital/[id]/rating-disputes', () => {
  it('403 for a different hospital\'s staff', async () => {
    mockRequireHospitalOwnership.mockResolvedValue(null);
    const res = await POST(postReq({ rating_type: 'general', rating_id: RATING_ID, complaint: 'unfair' }), {
      params: Promise.resolve({ id: HOSP_ID }),
    });
    expect(res.status).toBe(403);
  });

  it('400 for an invalid rating_type', async () => {
    mockRequireHospitalOwnership.mockResolvedValue(STAFF);
    const res = await POST(postReq({ rating_type: 'bogus', rating_id: RATING_ID, complaint: 'unfair' }), {
      params: Promise.resolve({ id: HOSP_ID }),
    });
    expect(res.status).toBe(400);
  });

  it('400 for a missing complaint', async () => {
    mockRequireHospitalOwnership.mockResolvedValue(STAFF);
    const res = await POST(postReq({ rating_type: 'general', rating_id: RATING_ID }), {
      params: Promise.resolve({ id: HOSP_ID }),
    });
    expect(res.status).toBe(400);
  });

  it('400 when fileDispute returns null (not this hospital\'s rating, or already disputed)', async () => {
    mockRequireHospitalOwnership.mockResolvedValue(STAFF);
    mockFileDispute.mockResolvedValue(null);
    const res = await POST(postReq({ rating_type: 'general', rating_id: RATING_ID, complaint: 'unfair' }), {
      params: Promise.resolve({ id: HOSP_ID }),
    });
    expect(res.status).toBe(400);
  });

  it('201 happy path, audit-logged', async () => {
    mockRequireHospitalOwnership.mockResolvedValue(STAFF);
    mockFileDispute.mockResolvedValue({ id: 'dispute1' });
    const res = await POST(postReq({ rating_type: 'department', rating_id: RATING_ID, complaint: 'This rating is unfair' }), {
      params: Promise.resolve({ id: HOSP_ID }),
    });
    expect(res.status).toBe(201);
    expect(mockFileDispute).toHaveBeenCalledWith(HOSP_ID, 'department', RATING_ID, 'staff1', 'This rating is unfair');
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'rating_dispute_filed' }));
  });
});
