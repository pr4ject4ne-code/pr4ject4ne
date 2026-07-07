/**
 * Integration tests for biodata GET authorization: session required, row
 * isolation (own data only), and IHN-code second factor.
 */
import { GET } from '@/app/api/biodata/[userId]/route';

jest.mock('next/headers', () => ({
  cookies: () => ({ get: () => ({ value: 'session-token' }) }),
}));

const mockGetPatientSession = jest.fn();
const mockCheckRateLimit = jest.fn().mockResolvedValue(true);
const mockQueryOne = jest.fn();

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
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));

const OWN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const IHN = 'IHN-ABCD-EFGH-JKMN';

function req(ihn?: string): Request {
  const headers: Record<string, string> = {};
  if (ihn) headers['x-ihn-code'] = ihn;
  return new Request(`http://localhost/api/biodata/${OWN_ID}`, { headers });
}

describe('GET /api/biodata/[userId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when there is no session', async () => {
    mockGetPatientSession.mockResolvedValue(null);
    const res = await GET(req(IHN), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(401);
  });

  it('403 when accessing another users biodata', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    const res = await GET(req(IHN), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(403);
  });

  it('401 when the IHN header is missing', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OWN_ID, account_type: 'patient' });
    const res = await GET(req(), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('IHN_REQUIRED');
  });

  it('401 when the IHN code does not match the record', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OWN_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({ user_id: OWN_ID, ihn_code: 'IHN-ZZZZ-ZZZZ-ZZZZ' });
    const res = await GET(req(IHN), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('IHN_INVALID');
  });

  it('200 with biodata when session + IHN match', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OWN_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: OWN_ID,
      ihn_code: IHN,
      profile_layer: { full_name: 'Ada' },
      biodata_layer: { blood_group: 'O+' },
      last_modified_at: '2026-07-05T00:00:00Z',
    });
    const res = await GET(req(IHN), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile_layer.full_name).toBe('Ada');
    expect(json.biodata_layer.blood_group).toBe('O+');
  });

  it('429 when rate limited', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OWN_ID, account_type: 'patient' });
    mockCheckRateLimit.mockResolvedValueOnce(false);
    const res = await GET(req(IHN), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(429);
  });
});
