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
    expect(json).toEqual({ available: false, profile_layer: {}, biodata_layer: {}, report: null });
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
    expect(json).toEqual({ available: false, profile_layer: {}, biodata_layer: {}, report: null });
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

  it('attaches a report; a credited doctor only gets a signature when their consent is approved', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
    mockQueryOne
      .mockResolvedValueOnce({ user_id: TARGET_ID })
      .mockResolvedValueOnce({
        user_id: TARGET_ID,
        ihn_code: IHN,
        profile_layer: {},
        biodata_layer: {
          clinical_conditions: [{ condition: 'Hypertension', doctor_id: DOCTOR_ID }],
        },
        sharing_prefs: { clinical_conditions: true },
      });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: DOCTOR_ID,
          name: 'Ada Obi',
          contact_phone: '0800-000-0000',
          contact_email: null,
          consent_status: 'approved',
          denial_reason: null,
        },
      ],
    });
    const res = await GET(req(IHN));
    const json = await res.json();
    expect(json.available).toBe(true);
    expect(json.report.signatures).toEqual([{ doctorId: DOCTOR_ID, name: 'Ada Obi', contact: '0800-000-0000' }]);
    expect(json.report.declaration).toMatch(/doctor's explicit consent/);
  });

  it('resolves consent SCOPED TO THE TARGET PATIENT (row.user_id), never doctor-only (migration 016 regression)', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
    mockQueryOne
      .mockResolvedValueOnce({ user_id: TARGET_ID })
      .mockResolvedValueOnce({
        user_id: TARGET_ID,
        ihn_code: IHN,
        profile_layer: {},
        biodata_layer: {
          clinical_conditions: [{ condition: 'Hypertension', doctor_id: DOCTOR_ID }],
        },
        sharing_prefs: { clinical_conditions: true },
      });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await GET(req(IHN));
    const consentLookupParams = mockQuery.mock.calls[0]![1] as unknown[];
    // fetchDoctorAttributionLookup(doctorIds, patientUserId) — the patient is
    // the biodata OWNER (TARGET_ID), never anything from request input.
    expect(consentLookupParams[1]).toBe(TARGET_ID);
  });

  it('strips doctor_id from the raw biodata_layer clinical_conditions in the response (HIGH finding) — even though the report field still attributes correctly', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
    mockQueryOne
      .mockResolvedValueOnce({ user_id: TARGET_ID })
      .mockResolvedValueOnce({
        user_id: TARGET_ID,
        ihn_code: IHN,
        profile_layer: {},
        biodata_layer: {
          clinical_conditions: [{ condition: 'Hypertension', doctor_id: DOCTOR_ID }],
        },
        sharing_prefs: { clinical_conditions: true },
      });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: DOCTOR_ID,
          name: 'Ada Obi',
          contact_phone: '0800-000-0000',
          contact_email: null,
          consent_status: 'approved',
          denial_reason: null,
        },
      ],
    });
    const res = await GET(req(IHN));
    const json = await res.json();
    expect(JSON.stringify(json.biodata_layer)).not.toContain(DOCTOR_ID);
    expect(json.biodata_layer.clinical_conditions[0].doctor_id).toBeUndefined();
    // The report field is unaffected — attribution still surfaces correctly there.
    expect(json.report.signatures).toEqual([{ doctorId: DOCTOR_ID, name: 'Ada Obi', contact: '0800-000-0000' }]);
  });

  it('never shows a doctor name when there is no consent record for the credited doctor', async () => {
    mockGetPatientSession.mockResolvedValue({ user_id: REQUESTER_ID, account_type: 'patient' });
    const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
    mockQueryOne
      .mockResolvedValueOnce({ user_id: TARGET_ID })
      .mockResolvedValueOnce({
        user_id: TARGET_ID,
        ihn_code: IHN,
        profile_layer: {},
        biodata_layer: {
          clinical_conditions: [{ condition: 'Hypertension', doctor_id: DOCTOR_ID }],
        },
        sharing_prefs: { clinical_conditions: true },
      });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: DOCTOR_ID, name: 'Ada Obi', contact_phone: null, contact_email: null, consent_status: null, denial_reason: null },
      ],
    });
    const res = await GET(req(IHN));
    const json = await res.json();
    expect(json.report.signatures).toEqual([]);
    expect(JSON.stringify(json.report.sections)).not.toContain('Ada Obi');
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
