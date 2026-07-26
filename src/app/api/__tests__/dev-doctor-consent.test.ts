/**
 * Tests for the doctor-consent-record CRUD route (worklist #30) — any
 * developer (primary or secondary) may search doctors and record/update a
 * consent outcome. Gated behind the same getDevUser pattern as sibling dev
 * routes (dev/tertiary, dev/first-aid).
 */
import { GET, POST, PATCH } from '@/app/api/dev/doctor-consent/route';

const mockGetDevUser = jest.fn();
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();

jest.mock('@/lib/dev-auth', () => ({
  getDevUser: (...a: unknown[]) => mockGetDevUser(...a),
}));
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
function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/dev/doctor-consent', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDevUser.mockResolvedValue({ id: DEV_ID, access_level: 'secondary' });
});

describe('GET /api/dev/doctor-consent', () => {
  it('403 without a developer session', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it('any developer (secondary included) may search — not primary-only', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await GET(getReq('?q=Ada'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/dev/doctor-consent', () => {
  it('400 on an invalid consent_status', async () => {
    const res = await POST(postReq({ doctor_id: DOCTOR_ID, consent_status: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('404 when the doctor does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const res = await POST(postReq({ doctor_id: DOCTOR_ID, consent_status: 'approved' }));
    expect(res.status).toBe(404);
  });

  it('creates a record and audit-logs doctor_consent_recorded', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DOCTOR_ID });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RECORD_ID }] });
    const res = await POST(
      postReq({ doctor_id: DOCTOR_ID, consent_status: 'approved', contacted_via: 'phone call' }),
    );
    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'doctor_consent_recorded',
        userId: DEV_ID,
        resourceId: DOCTOR_ID,
        details: expect.objectContaining({ consent_status: 'approved' }),
      }),
    );
  });

  it('only stores a denial_reason when consent_status is denied', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DOCTOR_ID });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: RECORD_ID }] });
    await POST(postReq({ doctor_id: DOCTOR_ID, consent_status: 'approved', denial_reason: 'should be ignored' }));
    const insertParams = mockQuery.mock.calls[0]![1] as unknown[];
    // params: [doctor_id, consent_status, contacted_via, denial_reason, dev.id]
    expect(insertParams[3]).toBeNull();
  });
});

describe('PATCH /api/dev/doctor-consent', () => {
  it('404 when the record does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ id: RECORD_ID, consent_status: 'denied' }));
    expect(res.status).toBe(404);
  });

  it('updates the record and audit-logs doctor_consent_updated', async () => {
    mockQueryOne.mockResolvedValueOnce({ doctor_id: DOCTOR_ID });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const res = await PATCH(patchReq({ id: RECORD_ID, consent_status: 'denied', denial_reason: 'declined' }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'doctor_consent_updated', resourceId: DOCTOR_ID }),
    );
  });
});
