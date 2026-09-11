/**
 * Tests for the doctor-consent-record CRUD route (worklist #30, reworked for
 * item 4 / migration 029) — any developer, primary or secondary (item 6),
 * identifies a doctor, a target patient, AND a specific clinical_condition,
 * and records the outcome
 * of an out-of-band consent contact, scoped to that exact
 * (doctor, patient, clinical_condition) triple. Migration 016 fixed a
 * fabricated-attribution vulnerability where a per-doctor-only approval
 * could be fabricated onto a different patient's clinical_conditions entry;
 * migration 029 closes the remaining gap where one approval used to cover
 * every field citing that doctor for that patient, even fields never
 * actually reviewed.
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
const CONDITION_ID = 'cond-1';

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

/** Sets up the doctor + patient + biodata-with-the-condition mock chain a
 *  successful POST needs, in the exact call order the route makes them. */
function mockSuccessfulLookups() {
  mockQueryOne.mockResolvedValueOnce({ id: DOCTOR_ID }); // doctor exists
  mockQueryOne.mockResolvedValueOnce({ id: PATIENT_ID }); // patient exists
  mockQueryOne.mockResolvedValueOnce({ clinical_conditions: [{ id: CONDITION_ID }] }); // condition belongs to patient
}

beforeEach(() => {
  jest.clearAllMocks();
  // Secondary by default now (item 6 — this route no longer distinguishes
  // primary from secondary at all; using secondary as the default here is
  // itself part of proving that, since every other describe block below
  // still passes with it).
  mockGetDevUser.mockResolvedValue({ id: DEV_ID, access_level: 'secondary' });
});

describe('authorization: any developer, primary or secondary (item 6)', () => {
  it('403 without a developer session at all', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it('a SECONDARY developer may GET — item 6: secondary has the same authority as primary over hospital admins and users (this route manages patient consent, not other developer accounts)', async () => {
    mockGetDevUser.mockResolvedValue({ id: DEV_ID, access_level: 'secondary' });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
  });

  it('a SECONDARY developer may POST (record a consent decision)', async () => {
    mockGetDevUser.mockResolvedValue({ id: DEV_ID, access_level: 'secondary' });
    mockSuccessfulLookups();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RECORD_ID }] });
    const res = await POST(
      postReq({ doctor_id: DOCTOR_ID, patient_user_id: PATIENT_ID, clinical_condition_id: CONDITION_ID, consent_status: 'approved' }),
    );
    expect(res.status).toBe(201);
  });

  it('a PRIMARY developer may equally do both — no special primary-only capability remains on this route', async () => {
    mockGetDevUser.mockResolvedValue({ id: DEV_ID, access_level: 'primary' });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
  });
});

describe('GET /api/dev/doctor-consent (doctors, default resource)', () => {
  it('a developer may search doctors', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const res = await GET(getReq('?q=Ada'));
    expect(res.status).toBe(200);
  });

  it('without a patient_user_id, no consent-scoping join is applied (params stay at limit/offset only)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await GET(getReq('?q=Ada'));
    const listParams = mockQuery.mock.calls[1]![1] as unknown[];
    // params = [q, limit, offset] — no patient/condition id inserted.
    expect(listParams).toHaveLength(3);
  });

  it('a patient_user_id WITHOUT a clinical_condition_id is not enough to scope consent (no longer meaningful alone)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await GET(getReq(`?q=Ada&patient_user_id=${PATIENT_ID}`));
    const listParams = mockQuery.mock.calls[1]![1] as unknown[];
    expect(listParams).not.toContain(PATIENT_ID);
  });

  it('with BOTH patient_user_id and clinical_condition_id, the doctor list query is scoped to that exact field', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await GET(getReq(`?q=Ada&patient_user_id=${PATIENT_ID}&clinical_condition_id=${CONDITION_ID}`));
    const listParams = mockQuery.mock.calls[1]![1] as unknown[];
    expect(listParams).toContain(PATIENT_ID);
    expect(listParams).toContain(CONDITION_ID);
    const sql = mockQuery.mock.calls[1]![0] as string;
    expect(sql).toMatch(/r\.patient_user_id\s*=\s*\$\d/);
    expect(sql).toMatch(/r\.clinical_condition_id\s*=\s*\$\d/);
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

describe('GET /api/dev/doctor-consent?resource=requests (item 4 — the dev queue)', () => {
  it('returns the requests list for any developer, primary or secondary', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await GET(getReq('?resource=requests'));
    expect(res.status).toBe(200);
    const sql = mockQuery.mock.calls[0]![0] as string;
    // Only the most-recent row per (doctor, patient, field) triple, and only
    // still-pending ones — a triple that already moved to approved/denied
    // must not reappear in the queue.
    expect(sql).toMatch(/DISTINCT ON \(r\.doctor_id, r\.patient_user_id, r\.clinical_condition_id\)/);
    expect(sql).toMatch(/latest\.consent_status = 'pending'/);
  });

  it('403 without a developer session at all — but a secondary session works fine', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await GET(getReq('?resource=requests'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/dev/doctor-consent', () => {
  it('400 on an invalid consent_status', async () => {
    const res = await POST(
      postReq({ doctor_id: DOCTOR_ID, patient_user_id: PATIENT_ID, clinical_condition_id: CONDITION_ID, consent_status: 'yes' }),
    );
    expect(res.status).toBe(400);
  });

  it('400 when patient_user_id is missing — a doctor can no longer be recorded without a target patient', async () => {
    const res = await POST(postReq({ doctor_id: DOCTOR_ID, clinical_condition_id: CONDITION_ID, consent_status: 'approved' }));
    expect(res.status).toBe(400);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('400 when clinical_condition_id is missing — consent is scoped to one field, not the whole record (item 4)', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DOCTOR_ID });
    mockQueryOne.mockResolvedValueOnce({ id: PATIENT_ID });
    const res = await POST(
      postReq({ doctor_id: DOCTOR_ID, patient_user_id: PATIENT_ID, consent_status: 'approved' }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when clinical_condition_id doesn't actually belong to this patient's biodata", async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DOCTOR_ID });
    mockQueryOne.mockResolvedValueOnce({ id: PATIENT_ID });
    mockQueryOne.mockResolvedValueOnce({ clinical_conditions: [{ id: 'some-other-condition' }] });
    const res = await POST(
      postReq({ doctor_id: DOCTOR_ID, patient_user_id: PATIENT_ID, clinical_condition_id: CONDITION_ID, consent_status: 'approved' }),
    );
    expect(res.status).toBe(400);
  });

  it('404 when the doctor does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const res = await POST(
      postReq({ doctor_id: DOCTOR_ID, patient_user_id: PATIENT_ID, clinical_condition_id: CONDITION_ID, consent_status: 'approved' }),
    );
    expect(res.status).toBe(404);
  });

  it('404 when the patient does not exist / is not a patient account', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DOCTOR_ID }); // doctor exists
    mockQueryOne.mockResolvedValueOnce(null); // patient lookup fails
    const res = await POST(
      postReq({ doctor_id: DOCTOR_ID, patient_user_id: PATIENT_ID, clinical_condition_id: CONDITION_ID, consent_status: 'approved' }),
    );
    expect(res.status).toBe(404);
  });

  it('creates a record scoped to the doctor+patient+field triple and audit-logs doctor_consent_recorded', async () => {
    mockSuccessfulLookups();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RECORD_ID }] });
    const res = await POST(
      postReq({
        doctor_id: DOCTOR_ID,
        patient_user_id: PATIENT_ID,
        clinical_condition_id: CONDITION_ID,
        consent_status: 'approved',
        contacted_via: 'phone call',
      }),
    );
    expect(res.status).toBe(201);
    const insertParams = mockQuery.mock.calls[0]![1] as unknown[];
    // params: [doctor_id, patient_user_id, clinical_condition_id, consent_status, contacted_via, denial_reason, dev.id, ...]
    expect(insertParams[0]).toBe(DOCTOR_ID);
    expect(insertParams[1]).toBe(PATIENT_ID);
    expect(insertParams[2]).toBe(CONDITION_ID);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'doctor_consent_recorded',
        userId: DEV_ID,
        resourceId: DOCTOR_ID,
        details: expect.objectContaining({
          consent_status: 'approved',
          patient_user_id: PATIENT_ID,
          clinical_condition_id: CONDITION_ID,
        }),
      }),
    );
  });

  it('stores doctor_email (when valid) and doctor_signature alongside the record', async () => {
    mockSuccessfulLookups();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RECORD_ID }] });
    await POST(
      postReq({
        doctor_id: DOCTOR_ID,
        patient_user_id: PATIENT_ID,
        clinical_condition_id: CONDITION_ID,
        consent_status: 'approved',
        doctor_email: 'dr.ada@hosp.co',
        doctor_signature: 'Replied by email: "I consent."',
      }),
    );
    const insertParams = mockQuery.mock.calls[0]![1] as unknown[];
    // params: [doctor_id, patient_user_id, clinical_condition_id, consent_status, contacted_via, denial_reason, dev.id, doctor_email, doctor_signature]
    expect(insertParams[7]).toBe('dr.ada@hosp.co');
    expect(insertParams[8]).toBe('Replied by email: "I consent."');
  });

  it('drops an invalid doctor_email rather than storing garbage', async () => {
    mockSuccessfulLookups();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RECORD_ID }] });
    await POST(
      postReq({
        doctor_id: DOCTOR_ID,
        patient_user_id: PATIENT_ID,
        clinical_condition_id: CONDITION_ID,
        consent_status: 'approved',
        doctor_email: 'not-an-email',
      }),
    );
    const insertParams = mockQuery.mock.calls[0]![1] as unknown[];
    expect(insertParams[7]).toBeNull();
  });

  it('only stores a denial_reason when consent_status is denied', async () => {
    mockSuccessfulLookups();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RECORD_ID }] });
    await POST(
      postReq({
        doctor_id: DOCTOR_ID,
        patient_user_id: PATIENT_ID,
        clinical_condition_id: CONDITION_ID,
        consent_status: 'approved',
        denial_reason: 'should be ignored',
      }),
    );
    const insertParams = mockQuery.mock.calls[0]![1] as unknown[];
    expect(insertParams[5]).toBeNull();
  });
});

describe('append-only: no PATCH endpoint', () => {
  it('the route module does not export PATCH', async () => {
    const mod = await import('@/app/api/dev/doctor-consent/route');
    expect((mod as Record<string, unknown>).PATCH).toBeUndefined();
  });
});
