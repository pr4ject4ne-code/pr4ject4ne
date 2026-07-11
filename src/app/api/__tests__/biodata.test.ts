/**
 * Integration tests for biodata GET authorization: session required, row
 * isolation (own data only), and IHN-code second factor.
 */
import { GET, PATCH } from '@/app/api/biodata/[userId]/route';

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

describe('PATCH /api/biodata/[userId]', () => {
  beforeEach(() => jest.clearAllMocks());

  function patchReq(body: unknown, ihn = IHN): Request {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (ihn) headers['x-ihn-code'] = ihn;
    return new Request(`http://localhost/api/biodata/${OWN_ID}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
  }

  /** Make authorize() pass: valid patient session + matching IHN record. */
  function passAuth() {
    mockGetPatientSession.mockResolvedValue({ user_id: OWN_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: OWN_ID,
      ihn_code: IHN,
      profile_layer: {},
      biodata_layer: {},
    });
  }

  it('401 when there is no session (same gate as GET)', async () => {
    mockGetPatientSession.mockResolvedValue(null);
    const res = await PATCH(patchReq({ profile_layer: { full_name: 'X' } }), {
      params: Promise.resolve({ userId: OWN_ID }),
    });
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('403 on a cross-user write (session user != path user)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    const res = await PATCH(patchReq({ profile_layer: { full_name: 'X' } }), {
      params: Promise.resolve({ userId: OWN_ID }),
    });
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('401 when the IHN header is missing (same IHN gate as GET)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OWN_ID, account_type: 'patient' });
    const res = await PATCH(patchReq({ profile_layer: { full_name: 'X' } }, ''), {
      params: Promise.resolve({ userId: OWN_ID }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('IHN_REQUIRED');
  });

  it('derives BMI server-side and ignores a client-sent bmi', async () => {
    passAuth();
    // 180cm, 81kg -> BMI 25.0. Client tries to inject bmi: 1.
    const res = await PATCH(
      patchReq({ biodata_layer: { height_cm: 180, weight_kg: 81, bmi: 1 } }),
      { params: Promise.resolve({ userId: OWN_ID }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.biodata_layer.bmi).toBe(25);

    // The persisted biodata_layer (UPDATE $3) must also carry the derived BMI, not 1.
    const updateArgs = mockQuery.mock.calls[0][1] as string[];
    const persisted = JSON.parse(updateArgs[2] as string);
    expect(persisted.bmi).toBe(25);
  });

  it('400 when there is nothing to update', async () => {
    passAuth();
    const res = await PATCH(patchReq({}), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(400);
  });
});
