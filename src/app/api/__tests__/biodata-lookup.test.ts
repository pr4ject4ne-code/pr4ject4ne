/**
 * Tests for GET /api/biodata/lookup — the by-IHN-code resolution path behind
 * worklist #24's "string tab". Mirrors the rigor of biodata.test.ts's existing
 * cross-user-read tests: same session gate, same rate-limit/audit expectations,
 * plus the code-resolution step's own sibling buckets + no-match logging and
 * enumeration-safety (no-match vs. nothing-shared collapse to the same response).
 */
import { GET } from '@/app/api/biodata/lookup/route';

jest.mock('next/headers', () => ({
  cookies: () => ({ get: () => ({ value: 'session-token' }) }),
}));

const mockGetPatientSession = jest.fn();
const mockCheckRateLimit = jest.fn().mockResolvedValue(true);
const mockQueryOne = jest.fn();
const mockQuery = jest.fn().mockResolvedValue({ rows: [] });

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    getPatientSession: (...a: unknown[]) => mockGetPatientSession(...a),
    checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  };
});

jest.mock('@/lib/db', () => ({
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: (...a: unknown[]) => mockQuery(...a),
}));

const mockLogAudit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/audit', () => ({
  logAudit: (...a: unknown[]) => mockLogAudit(...a),
  clientIpFrom: () => null,
}));

const REQUESTER_ID = '33333333-3333-4333-8333-333333333333';
const TARGET_ID = '11111111-1111-4111-8111-111111111111';
const IHN = 'IHN-ABCD-EFGH-JKMN';

function req(ihn: string): Request {
  return new Request(`http://localhost/api/biodata/lookup?ihn=${encodeURIComponent(ihn)}`);
}

describe('GET /api/biodata/lookup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when there is no session', async () => {
    mockGetPatientSession.mockResolvedValue(null);
    const res = await GET(req(IHN));
    expect(res.status).toBe(401);
  });

  it('400 on a malformed code, before ever touching the DB', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    const res = await GET(req('not-a-code'));
    expect(res.status).toBe(400);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('429 when the per-code lookup bucket is exhausted', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    mockCheckRateLimit.mockResolvedValueOnce(false); // code bucket
    const res = await GET(req(IHN));
    expect(res.status).toBe(429);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rate_limited', details: { endpoint: 'biodata_lookup' } }),
    );
  });

  it('429 when the per-IP lookup bucket is exhausted', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    mockCheckRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // ip bucket
    const res = await GET(req(IHN));
    expect(res.status).toBe(429);
  });

  it('no match: 200 with available:false, logs biodata_lookup_no_match (not exposed in the response)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValueOnce(null); // resolve step finds nobody
    const res = await GET(req(IHN));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ available: false, profile_layer: {}, biodata_layer: {} });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'biodata_lookup_no_match', details: { ihn_code: IHN } }),
    );
  });

  it('matched but nothing opted in: same available:false shape as no-match (enumeration-safe)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    mockQueryOne
      .mockResolvedValueOnce({ user_id: TARGET_ID }) // resolve step
      .mockResolvedValueOnce({
        user_id: TARGET_ID,
        ihn_code: IHN,
        profile_layer: { full_name: 'Ada' },
        biodata_layer: { blood_group: 'O+' },
        sharing_prefs: {}, // nothing opted in
      });
    const res = await GET(req(IHN));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ available: false, profile_layer: {}, biodata_layer: {} });
  });

  it('matched with something shared: available:true and only the opted-in fields, via the SAME pipeline as [userId]', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    mockQueryOne
      .mockResolvedValueOnce({ user_id: TARGET_ID })
      .mockResolvedValueOnce({
        user_id: TARGET_ID,
        ihn_code: IHN,
        profile_layer: { full_name: 'Ada' },
        biodata_layer: { blood_group: 'O+', genotype: 'AA' },
        sharing_prefs: { blood_group: true },
      });
    const res = await GET(req(IHN));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.available).toBe(true);
    expect(json.biodata_layer).toEqual({ blood_group: 'O+' });
    expect(json.biodata_layer.genotype).toBeUndefined();
    expect(json.profile_layer).toEqual({});
    expect(json.ihn_code).toBeUndefined();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'biodata_shared_read', userId: REQUESTER_ID, resourceId: TARGET_ID }),
    );
  });

  it('reuses the existing biodata_shared_target/biodata_shared_ip buckets (not a new weaker path) once resolved', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    mockQueryOne
      .mockResolvedValueOnce({ user_id: TARGET_ID })
      .mockResolvedValueOnce({
        user_id: TARGET_ID,
        ihn_code: IHN,
        profile_layer: {},
        biodata_layer: {},
        sharing_prefs: {},
      });
    await GET(req(IHN));
    const buckets = mockCheckRateLimit.mock.calls.map((c) => c[0] as string);
    expect(buckets.some((b) => b.startsWith('biodata_lookup_code:'))).toBe(true);
    expect(buckets.some((b) => b.startsWith('biodata_lookup_ip:'))).toBe(true);
    expect(buckets.some((b) => b.startsWith('biodata_shared_target:'))).toBe(true);
    expect(buckets.some((b) => b.startsWith('biodata_shared_ip:'))).toBe(true);
  });
});
