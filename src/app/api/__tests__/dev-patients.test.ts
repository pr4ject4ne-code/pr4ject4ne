/**
 * Item 6: patient account management, mirroring dev-tertiary's own test
 * shape. The central assertion across this file is that a SECONDARY
 * developer can do everything a primary can here — the primary/secondary
 * split only applies to /api/dev/accounts (managing other developers).
 */
const mockGetDevUser = jest.fn();
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/dev-auth', () => ({ getDevUser: (...a: unknown[]) => mockGetDevUser(...a) }));
jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));
const mockLogAudit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => mockLogAudit(...a), clientIpFrom: () => null }));
jest.mock('@/lib/auth', () => ({ hashPassword: jest.fn().mockResolvedValue('hashed') }));

import { GET, PATCH } from '@/app/api/dev/patients/route';

const PATIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function getReq(qs = ''): Request {
  return new Request(`http://localhost/api/dev/patients${qs}`);
}
function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/dev/patients', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Secondary by default, deliberately — proving there is no primary-only
  // capability anywhere in this route (item 6).
  mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
});

describe('authorization', () => {
  it('403 without any developer session', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it('a SECONDARY developer may GET', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
  });

  it('a SECONDARY developer may PATCH (revoke)', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: PATIENT_ID });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 1 });
    const res = await PATCH(patchReq({ id: PATIENT_ID, action: 'revoke' }));
    expect(res.status).toBe(200);
  });

  it('a PRIMARY developer has no extra capability here', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'primary' });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
  });
});

describe('GET — only account_type = patient rows, searchable by email', () => {
  it('scopes the query to account_type = patient', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await GET(getReq('?q=ada'));
    const countSql = mockQuery.mock.calls[0]![0] as string;
    expect(countSql).toMatch(/account_type = 'patient'/);
  });

  it('never returns biodata — only account fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await GET(getReq());
    const listSql = mockQuery.mock.calls[1]![0] as string;
    expect(listSql).not.toMatch(/biodata/i);
    expect(listSql).toMatch(/id, email, is_active, last_login, created_at/);
  });
});

describe('PATCH', () => {
  it('400 with a missing action', async () => {
    const res = await PATCH(patchReq({ id: PATIENT_ID }));
    expect(res.status).toBe(400);
  });

  it('404 when the id is not a patient account (e.g. belongs to a hospital_staff or developer account)', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ id: PATIENT_ID, action: 'revoke' }));
    expect(res.status).toBe(404);
  });

  it('revoke sets is_active = false and destroys sessions, fully audit-logged (item 6)', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: PATIENT_ID });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 1 });
    const res = await PATCH(patchReq({ id: PATIENT_ID, action: 'revoke' }));
    expect(res.status).toBe(200);
    const updateParams = mockQuery.mock.calls[0]![1] as unknown[];
    expect(updateParams).toEqual([PATIENT_ID, false]);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'patient_account_change', resourceId: PATIENT_ID, details: { op: 'revoke' } }),
    );
  });

  it('reactivate sets is_active = true and does NOT destroy sessions', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: PATIENT_ID });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const res = await PATCH(patchReq({ id: PATIENT_ID, action: 'reactivate' }));
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('reset_password returns a temp_password and destroys sessions', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: PATIENT_ID });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 1 });
    const res = await PATCH(patchReq({ id: PATIENT_ID, action: 'reset_password' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.temp_password).toBe('string');
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'patient_account_change', details: { op: 'reset_password' } }),
    );
  });
});
