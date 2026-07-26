/**
 * Tests for the doctor-consent-record CRUD route (worklist #30) — a PRIMARY
 * developer identifies BOTH a doctor and a target patient and records the
 * outcome of an out-of-band consent contact, scoped to that exact
 * (doctor, patient) pair (migration 016 — fixes a fabricated-attribution
 * vulnerability where a per-doctor-only approval could be fabricated onto a
 * different patient's clinical_conditions entry).
 */
import { GET, POST } from '@/app/api/dev/doctor-consent/route';

const mockGetDevUser = jest.fn();
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();

jest.mock('@/lib/dev-auth', () => {
  const actual = jest.requireActual('@/lib/dev-auth');
  return {
    ...actual,
    getDevUser: (...a: unknown[]) => mockGetDevUser(...a),
  };
});
jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));
const mockLogAudit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/audit', () => ({
  logAudit: (...a: unknown[]) => mockLogAudit(...a),
  clientIpFrom: () => null,
}));

const DEV_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOCTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PATIENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RECORD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function getReq(qs = ''): Request {
  return new Request(`http://localhost/api/dev/doctor-consent${qs}`);
}
function postReq(body: unknown): Request {
  return new Request('http://localhost/api/dev/doctor-consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Primary by default — the POLICY gate (LOW/policy finding) is tested
  // explicitly below with a secondary session.
  mockGetDevUser.mockResolvedValue({ id: DEV_ID, access_level: 'primary' });
});

describe('authorization: primary only (was "any developer")', () => {
  it('403 without a developer session', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it('403 for a SECONDARY developer — recording consent has real third-party liability, same bar as /api/dev/accounts', async () => {
    mockGetDevUser.mockResolvedValue({ id: DEV_ID, access_level: 'secondary' });
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it('POST also 403s for a secondary developer', async () => {
    mockGetDevUser.mockResolvedValue({ id: DEV_ID, access_level: 'secondary' });
    const res = await POST(postReq({ doctor_id: DOCTOR_ID, patient_user_id: PATIENT_ID, consent_status: 'approved' }));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/dev/doctor-consent (doctors, default resource)', () => {
  it('primary may search doctors', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const res = await GET(getReq('?q=Ada'));
    expect(res.status).toBe(200);
  });

  it('without a patient_user_id, no consent-scoping join is applied (params stay at limit/offset only)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await GET(getReq('?q=Ada'));
    const listParams = mockQuery.mock.calls[1]![1] as unknown[];
    // params = [q, limit, offset] — no patient id inserted.
    expect(listParams).toHaveLength(3);
  });

  it('with a valid patient_user_id, the doctor list query is scoped to that patient', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await GET(getReq(`?q=Ada&patient_user_id=${PATIENT_ID}`));
    const listParams = mockQuery.mock.calls[1]![1] as unknown[];
    // params = [q, patient_user_id, limit, offset]
    expect(listParams).toContain(PATIENT_ID);
    const sql = mockQuery.mock.calls[1]![0] as string;
    expect(sql).toMatch(/r\.patient_user_id\s*=\s*\$\d/);
  });
});

describe('GET /api/dev/doctor-consent?resource=patients', () => {
  it('searches only account_type = patient rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const res = await GET(getReq('?resource=patients&q=ada@example.com'));
    expect(res.status).toBe(200);
    const countSql = mockQuery.mock.calls[0]![0] as string;
    expect(countSql).toMatch(/account_type = 'patient'/);
  });
});

describe('POST /api/dev/doctor-consent', () => {
  it('400 on an invalid consent_status', async () => {
    const res = await POST(postReq({ doctor_id: DOCTOR_ID, patient_user_id: PATIENT_ID, consent_status: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('400 when patient_user_id is missing — a doctor can no longer be recorded without a target patient', async () => {
    const res = await POST(postReq({ doctor_id: DOCTOR_ID, consent_status: 'approved' }));
    expect(res.status).toBe(400);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('404 when the doctor does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const res = await POST(
      postReq({ doctor_id: DOCTOR_ID, patient_user_id: PATIENT_ID, consent_status: 'approved' }),
    );
    expect(res.status).toBe(404);
  });

  it('404 when the patient does not exist / is not a patient account', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DOCTOR_ID }); // doctor exists
    mockQueryOne.mockResolvedValueOnce(null); // patient lookup fails
    const res = await POST(
      postReq({ doctor_id: DOCTOR_ID, patient_user_id: PATIENT_ID, consent_status: 'approved' }),
    );
    expect(res.status).toBe(404);
  });

  it('creates a record scoped to the doctor+patient pair and audit-logs doctor_consent_recorded', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DOCTOR_ID });
    mockQueryOne.mockResolvedValueOnce({ id: PATIENT_ID });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RECORD_ID }] });
    const res = await POST(
      postReq({
        doctor_id: DOCTOR_ID,
        patient_user_id: PATIENT_ID,
        consent_status: 'approved',
        contacted_via: 'phone call',
      }),
    );
    expect(res.status).toBe(201);
    const insertParams = mockQuery.mock.calls[0]![1] as unknown[];
    // params: [doctor_id, patient_user_id, consent_status, contacted_via, denial_reason, dev.id]
    expect(insertParams[0]).toBe(DOCTOR_ID);
    expect(insertParams[1]).toBe(PATIENT_ID);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'doctor_consent_recorded',
        userId: DEV_ID,
        resourceId: DOCTOR_ID,
        details: expect.objectContaining({ consent_status: 'approved', patient_user_id: PATIENT_ID }),
      }),
    );
  });

  it('only stores a denial_reason when consent_status is denied', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DOCTOR_ID });
    mockQueryOne.mockResolvedValueOnce({ id: PATIENT_ID });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RECORD_ID }] });
    await POST(
      postReq({
        doctor_id: DOCTOR_ID,
        patient_user_id: PATIENT_ID,
        consent_status: 'approved',
        denial_reason: 'should be ignored',
      }),
    );
    const insertParams = mockQuery.mock.calls[0]![1] as unknown[];
    expect(insertParams[4]).toBeNull();
  });
});

describe('append-only: no PATCH endpoint', () => {
  it('the route module does not export PATCH', async () => {
    const mod = await import('@/app/api/dev/doctor-consent/route');
    expect((mod as Record<string, unknown>).PATCH).toBeUndefined();
  });
});
