import { GET, PATCH } from '@/app/api/dev/rating-disputes/route';

const mockGetDevUser = jest.fn();
const mockListPendingDisputes = jest.fn();
const mockResolveDispute = jest.fn();
const mockFindDisputeById = jest.fn();
const mockLogAudit = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/dev-auth', () => ({ getDevUser: (...a: unknown[]) => mockGetDevUser(...a) }));
jest.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => mockLogAudit(...a), clientIpFrom: () => null }));
jest.mock('@/lib/rating-disputes', () => ({
  listPendingDisputes: (...a: unknown[]) => mockListPendingDisputes(...a),
  resolveDispute: (...a: unknown[]) => mockResolveDispute(...a),
  findDisputeById: (...a: unknown[]) => mockFindDisputeById(...a),
}));

const DISPUTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOSP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/dev/rating-disputes', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
});

describe('GET /api/dev/rating-disputes', () => {
  it('403 without any developer session', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('200 for a secondary developer — item 6, no primary-only gate', async () => {
    mockListPendingDisputes.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/dev/rating-disputes', () => {
  it('400 for an invalid status', async () => {
    const res = await PATCH(patchReq({ id: DISPUTE_ID, status: 'bogus' }));
    expect(res.status).toBe(400);
  });

  it('404 when the dispute does not exist', async () => {
    mockFindDisputeById.mockResolvedValue(null);
    const res = await PATCH(patchReq({ id: DISPUTE_ID, status: 'dismissed' }));
    expect(res.status).toBe(404);
  });

  it('400 when the dispute is already resolved', async () => {
    mockFindDisputeById.mockResolvedValue({ id: DISPUTE_ID, status: 'upheld' });
    const res = await PATCH(patchReq({ id: DISPUTE_ID, status: 'dismissed' }));
    expect(res.status).toBe(400);
  });

  it('200 happy path, audit-logged with the resolved hospital_id', async () => {
    mockFindDisputeById.mockResolvedValue({ id: DISPUTE_ID, status: 'pending' });
    mockResolveDispute.mockResolvedValue({ hospital_id: HOSP_ID });
    const res = await PATCH(patchReq({ id: DISPUTE_ID, status: 'upheld', resolution_note: 'Confirmed unfair' }));
    expect(res.status).toBe(200);
    expect(mockResolveDispute).toHaveBeenCalledWith(DISPUTE_ID, 'dev1', 'upheld', 'Confirmed unfair');
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rating_dispute_resolved', details: { status: 'upheld', hospital_id: HOSP_ID } }),
    );
  });
});
