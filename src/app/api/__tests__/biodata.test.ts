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

const mockLogAudit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/audit', () => ({
  logAudit: (...a: unknown[]) => mockLogAudit(...a),
  clientIpFrom: () => null,
}));

const OWN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const IHN = 'IHN-ABCD-EFGH-JKMN';

function req(ihn?: string, targetId = OWN_ID): Request {
  const headers: Record<string, string> = {};
  if (ihn) headers['x-ihn-code'] = ihn;
  return new Request(`http://localhost/api/biodata/${targetId}`, { headers });
}

describe('GET /api/biodata/[userId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when there is no session', async () => {
    mockGetPatientSession.mockResolvedValue(null);
    const res = await GET(req(IHN), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(401);
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

  it('200 with FULL biodata when the owner reads their own row (sharing_prefs is all-false and never gates this)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OWN_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: OWN_ID,
      ihn_code: IHN,
      profile_layer: { full_name: 'Ada' },
      biodata_layer: { blood_group: 'O+', genotype: 'AA' },
      sharing_prefs: {}, // nothing opted in — owner must still see everything
      last_modified_at: '2026-07-05T00:00:00Z',
    });
    const res = await GET(req(IHN), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile_layer.full_name).toBe('Ada');
    expect(json.biodata_layer.blood_group).toBe('O+');
    expect(json.biodata_layer.genotype).toBe('AA');
    expect(json.ihn_code).toBe(IHN); // owner's own read still returns the code
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'biodata_read', userId: OWN_ID }),
    );
  });

  it('429 when rate limited', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OWN_ID, account_type: 'patient' });
    mockCheckRateLimit.mockResolvedValueOnce(false);
    const res = await GET(req(IHN), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(429);
  });
});

describe('GET /api/biodata/[userId] — cross-user IHN-authenticated read (worklist #23)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is no longer 403 for a different authenticated patient session (the fixed dead path)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: OWN_ID,
      ihn_code: IHN,
      profile_layer: { full_name: 'Ada' },
      biodata_layer: { blood_group: 'O+' },
      sharing_prefs: { blood_group: true },
      last_modified_at: '2026-07-05T00:00:00Z',
    });
    const res = await GET(req(IHN, OWN_ID), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(200);
  });

  it('field-level isolation: a field NOT opted in is never returned, even when every other field is opted in', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: OWN_ID,
      ihn_code: IHN,
      profile_layer: { full_name: 'Ada' },
      biodata_layer: {
        blood_group: 'O+',
        genotype: 'AA', // deliberately NOT opted in below
        disability: 'None',
        health_preferences: 'Prefers female doctor',
        chronic_disease: 'Asthma',
        clinical_conditions: [{ condition: 'Hypertension', timestamp: '2026-01-01T00:00:00Z' }],
        occupation: 'Engineer',
        height_cm: 180,
      },
      sharing_prefs: {
        profile: true,
        demographics: true,
        anthropometrics: true,
        chronic_disease: true,
        blood_group: true,
        disability: true,
        health_preferences: true,
        clinical_conditions: true,
        genotype: false, // explicitly withheld
      },
      last_modified_at: '2026-07-05T00:00:00Z',
    });
    const res = await GET(req(IHN, OWN_ID), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.biodata_layer.genotype).toBeUndefined();
    expect(json.biodata_layer.blood_group).toBe('O+');
    expect(json.profile_layer.full_name).toBe('Ada');
    expect(json.ihn_code).toBeUndefined(); // never leak the code back
  });

  it('strips doctor_id from clinical_conditions on the cross-user response (security-audit fix — this route shares authorizeRead/buildReadResult with /api/biodata/lookup, which was fixed first)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: OWN_ID,
      ihn_code: IHN,
      profile_layer: {},
      biodata_layer: {
        clinical_conditions: [
          { condition: 'Hypertension', timestamp: '2026-01-01T00:00:00Z', doctor_id: 'doc-1' },
        ],
      },
      sharing_prefs: { clinical_conditions: true },
      last_modified_at: '2026-07-05T00:00:00Z',
    });
    const res = await GET(req(IHN, OWN_ID), { params: Promise.resolve({ userId: OWN_ID }) });
    const json = await res.json();
    expect(json.biodata_layer.clinical_conditions[0].doctor_id).toBeUndefined();
    expect(json.biodata_layer.clinical_conditions[0].condition).toBe('Hypertension');
  });

  it("does NOT strip doctor_id from the owner's own read of their own data (not a leak — only the cross-user response needs stripping)", async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OWN_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: OWN_ID,
      ihn_code: IHN,
      profile_layer: {},
      biodata_layer: {
        clinical_conditions: [
          { condition: 'Hypertension', timestamp: '2026-01-01T00:00:00Z', doctor_id: 'doc-1' },
        ],
      },
      sharing_prefs: {},
      last_modified_at: '2026-07-05T00:00:00Z',
    });
    const res = await GET(req(IHN, OWN_ID), { params: Promise.resolve({ userId: OWN_ID }) });
    const json = await res.json();
    expect(json.biodata_layer.clinical_conditions[0].doctor_id).toBe('doc-1');
  });

  it('default-deny: nothing is returned when sharing_prefs is empty/absent', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: OWN_ID,
      ihn_code: IHN,
      profile_layer: { full_name: 'Ada' },
      biodata_layer: { blood_group: 'O+' },
      sharing_prefs: {},
      last_modified_at: '2026-07-05T00:00:00Z',
    });
    const res = await GET(req(IHN, OWN_ID), { params: Promise.resolve({ userId: OWN_ID }) });
    const json = await res.json();
    expect(json.profile_layer).toEqual({});
    expect(json.biodata_layer).toEqual({});
  });

  it('logs a distinct biodata_shared_read action (not biodata_read) on both success and IHN mismatch', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: OWN_ID,
      ihn_code: IHN,
      profile_layer: {},
      biodata_layer: {},
      sharing_prefs: {},
    });
    await GET(req(IHN, OWN_ID), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'biodata_shared_read', userId: OTHER_ID, resourceId: OWN_ID }),
    );

    jest.clearAllMocks();
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({ user_id: OWN_ID, ihn_code: 'IHN-ZZZZ-ZZZZ-ZZZZ' });
    const res = await GET(req(IHN, OWN_ID), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(401);
    // Logged even on FAILURE — a wrong-code attempt against a real target is the abuse signal.
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'biodata_shared_read',
        userId: OTHER_ID,
        resourceId: OWN_ID,
        details: expect.objectContaining({ result: 'ihn_mismatch' }),
      }),
    );
  });

  it('uses a distinct rate-limit bucket for cross-user reads (target + IP), not the owner bucket', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    mockQueryOne.mockResolvedValue({
      user_id: OWN_ID,
      ihn_code: IHN,
      profile_layer: {},
      biodata_layer: {},
      sharing_prefs: {},
    });
    await GET(req(IHN, OWN_ID), { params: Promise.resolve({ userId: OWN_ID }) });
    const buckets = mockCheckRateLimit.mock.calls.map((c) => c[0] as string);
    expect(buckets.some((b) => b.startsWith('biodata_shared_target:'))).toBe(true);
    expect(buckets.some((b) => b.startsWith('biodata_shared_ip:'))).toBe(true);
    expect(buckets.some((b) => b.startsWith(`biodata:${OTHER_ID}`))).toBe(false);
  });

  it('429 when the cross-user bucket is exhausted', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    mockCheckRateLimit.mockResolvedValueOnce(false);
    const res = await GET(req(IHN, OWN_ID), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(res.status).toBe(429);
  });

  it('audit-logs a throttled cross-user attempt, not just IHN mismatches', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: OTHER_ID, account_type: 'patient' });
    mockCheckRateLimit.mockResolvedValueOnce(false);
    await GET(req(IHN, OWN_ID), { params: Promise.resolve({ userId: OWN_ID }) });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rate_limited',
        resourceId: OWN_ID,
        details: { endpoint: 'biodata_shared_read' },
      }),
    );
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
