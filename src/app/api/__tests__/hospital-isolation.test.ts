/**
 * Data-isolation tests for the hospital management portal. Hospital A staff must
 * never be able to read or write hospital B's data. Isolation is enforced by
 * requireHospitalOwnership comparing the session's hospital_id to the path id.
 */
import { PATCH as patchInfo } from '@/app/api/hospital/[id]/info/route';
import { POST as postDoctor, DELETE as deleteDoctor } from '@/app/api/hospital/[id]/personnel/route';
import { PATCH as patchHours } from '@/app/api/hospital/[id]/hours/route';
import { PUT as putMedia } from '@/app/api/hospital/[id]/media/route';
import { POST as postAnnouncement } from '@/app/api/hospital/[id]/announcements/route';

const mockGetSession = jest.fn();
const mockFindUserById = jest.fn();
const mockQuery = jest.fn().mockResolvedValue({ rows: [{ id: 'x' }], rowCount: 1 });
const mockQueryOne = jest.fn().mockResolvedValue({ id: 'x' });

jest.mock('next/headers', () => ({
  cookies: () => ({ get: () => ({ value: 'token' }), delete: jest.fn() }),
}));

// Exercise the REAL requireHospitalOwnership / getHospitalStaff. Those call
// getSession + findUserById from @/lib/auth across a module boundary, so we stub
// that boundary (which Jest can intercept) rather than getHospitalStaff itself
// (an intra-module call a partial mock would not intercept).
jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    getSession: (...a: unknown[]) => mockGetSession(...a),
    findUserById: (...a: unknown[]) => mockFindUserById(...a),
  };
});

jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));

const HOSP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOSP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Drive the auth boundary so getHospitalStaff resolves to the given staff (or null). */
function setStaff(staff: { userId: string; hospitalId: string } | null) {
  if (!staff) {
    mockGetSession.mockResolvedValue(null);
    return;
  }
  mockGetSession.mockResolvedValue({
    user_id: staff.userId,
    account_type: 'hospital_staff',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  mockFindUserById.mockResolvedValue({
    id: staff.userId,
    account_type: 'hospital_staff',
    is_active: true,
    hospital_id: staff.hospitalId,
  });
}

function infoReq(body: unknown, id: string): Request {
  return new Request(`http://localhost/api/hospital/${id}/info`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('hospital data isolation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403 when staff of hospital A edits hospital B info', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const res = await patchInfo(infoReq({ name: 'Hijack' }, HOSP_B), { params: Promise.resolve({ id: HOSP_B }) });
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('allows staff to edit their own hospital info', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const res = await patchInfo(infoReq({ name: 'New Name' }, HOSP_A), { params: Promise.resolve({ id: HOSP_A }) });
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('lets a hospital toggle its own show_doctors flag', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const res = await patchInfo(infoReq({ show_doctors: false }, HOSP_A), { params: Promise.resolve({ id: HOSP_A }) });
    expect(res.status).toBe(200);
    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('show_doctors');
    expect(values).toContain(false);
  });

  it('lets a hospital save well-formed departments, sanitized', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const res = await patchInfo(
      infoReq(
        { departments: [{ name: '<b>Surgery</b>', services: ['General Surgery', '  '] }] },
        HOSP_A,
      ),
      { params: Promise.resolve({ id: HOSP_A }) },
    );
    expect(res.status).toBe(200);
    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('departments');
    const stored = JSON.parse(values.find((v) => typeof v === 'string' && v.includes('Surgery')) as string);
    expect(stored).toEqual([{ name: '&lt;b&gt;Surgery&lt;/b&gt;', services: ['General Surgery'] }]);
  });

  it('drops malformed department entries instead of erroring', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const res = await patchInfo(
      infoReq({ departments: [{ services: ['Orphan service'] }, 'not-an-object', 42] }, HOSP_A),
      { params: Promise.resolve({ id: HOSP_A }) },
    );
    expect(res.status).toBe(200);
    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    const stored = JSON.parse(values.find((v) => typeof v === 'string' && v.startsWith('[')) as string);
    expect(stored).toEqual([]);
  });

  it('403 when staff of hospital A sets hospital B departments', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const res = await patchInfo(
      infoReq({ departments: [{ name: 'Sneaky', services: [] }] }, HOSP_B),
      { params: Promise.resolve({ id: HOSP_B }) },
    );
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('403 when staff of hospital A toggles hospital B show_doctors', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const res = await patchInfo(infoReq({ show_doctors: true }, HOSP_B), { params: Promise.resolve({ id: HOSP_B }) });
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('401/403 when there is no hospital session', async () => {
    setStaff(null);
    const res = await patchInfo(infoReq({ name: 'x' }, HOSP_A), { params: Promise.resolve({ id: HOSP_A }) });
    expect(res.status).toBe(403);
  });

  it('403 when staff of hospital A adds a doctor to hospital B', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const req = new Request(`http://localhost/api/hospital/${HOSP_B}/personnel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Dr Sneaky' }),
    });
    const res = await postDoctor(req, { params: Promise.resolve({ id: HOSP_B }) });
    expect(res.status).toBe(403);
  });

  it('403 when staff of hospital A deletes a doctor from hospital B', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const req = new Request(
      `http://localhost/api/hospital/${HOSP_B}/personnel?doctor_id=cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
      { method: 'DELETE' },
    );
    const res = await deleteDoctor(req, { params: Promise.resolve({ id: HOSP_B }) });
    expect(res.status).toBe(403);
  });

  it('403 when staff of hospital A sets hospital B hours', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const req = new Request(`http://localhost/api/hospital/${HOSP_B}/hours`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hours: { mon: '9-5' } }),
    });
    const res = await patchHours(req, { params: Promise.resolve({ id: HOSP_B }) });
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('403 when staff of hospital A replaces hospital B media', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const req = new Request(`http://localhost/api/hospital/${HOSP_B}/media`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ photos: [{ url: 'https://x.test/a.jpg', slot: 'reception' }] }),
    });
    const res = await putMedia(req, { params: Promise.resolve({ id: HOSP_B }) });
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('403 when staff of hospital A posts an announcement to hospital B', async () => {
    setStaff({ userId: 'staffA', hospitalId: HOSP_A });
    const req = new Request(`http://localhost/api/hospital/${HOSP_B}/announcements`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Sneaky notice', color: 'red' }),
    });
    const res = await postAnnouncement(req, { params: Promise.resolve({ id: HOSP_B }) });
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
