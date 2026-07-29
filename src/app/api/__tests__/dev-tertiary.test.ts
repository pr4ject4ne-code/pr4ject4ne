/**
 * Tests for tertiary (hospital_staff) provisioning by developers.
 */
import { POST, PATCH } from '@/app/api/dev/tertiary/route';

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
jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));

const HOSP = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

function req(body: unknown, method = 'POST'): Request {
  return new Request('http://localhost/api/dev/tertiary', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/dev/tertiary', () => {
  it('403 when the caller is not a developer', async () => {
    mockGetDevUser.mockResolvedValue(null);
    const res = await POST(req({ email: 'a@b.co', hospital_id: HOSP }));
    expect(res.status).toBe(403);
  });

  it('400 without a valid hospital_id', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    const res = await POST(req({ email: 'a@b.co', hospital_id: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('404 when the hospital does not exist', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue(null);
    const res = await POST(req({ email: 'a@b.co', hospital_id: HOSP }));
    expect(res.status).toBe(404);
  });

  it('creates a tertiary and returns a one-time temp password', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: HOSP });
    mockQuery.mockResolvedValue({ rows: [{ id: USER }] });
    const res = await POST(req({ email: 'staff@hosp.co', hospital_id: HOSP }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe(USER);
    expect(typeof json.temp_password).toBe('string');
    expect(json.temp_password.length).toBeGreaterThan(10);
  });

  it('marks the hospital verified (account_id + verified) when its first tertiary account is created — the actual "verification handover" (worklist #36)', async () => {
    // Before this fix, nothing anywhere in the codebase ever set
    // hospitals.account_id/verified — the schema's own definition of
    // "verified" (migration 001) was decorative. This is the regression
    // test for that gap.
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: HOSP });
    mockQuery.mockResolvedValue({ rows: [{ id: USER }] });
    const res = await POST(req({ email: 'staff@hosp.co', hospital_id: HOSP }));
    expect(res.status).toBe(201);
    const updateCall = mockQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('UPDATE hospitals'),
    );
    expect(updateCall).toBeDefined();
    const [sql, values] = updateCall as [string, unknown[]];
    expect(sql).toContain('account_id');
    expect(sql).toContain('verified = TRUE');
    expect(values).toEqual([USER, HOSP]);
  });

  it('uses a dev-chosen password instead of auto-generating one when provided', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: HOSP });
    mockQuery.mockResolvedValue({ rows: [{ id: USER }] });
    const res = await POST(req({ email: 'staff@hosp.co', hospital_id: HOSP, password: 'ChosenPass123!' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.temp_password).toBe('ChosenPass123!');
  });

  it('400 when the dev-chosen password is weak', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: HOSP });
    const res = await POST(req({ email: 'staff@hosp.co', hospital_id: HOSP, password: 'weak' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('WEAK_PASSWORD');
  });

  it('409 on a duplicate email', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQueryOne.mockResolvedValue({ id: HOSP });
    mockQuery.mockRejectedValue(new Error('duplicate key value violates unique constraint "users_email_key"'));
    const res = await POST(req({ email: 'dupe@hosp.co', hospital_id: HOSP }));
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/dev/tertiary', () => {
  it('404 when reset targets a non-existent tertiary', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'primary' });
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const res = await PATCH(req({ id: USER, action: 'reset_password' }, 'PATCH'));
    expect(res.status).toBe(404);
  });

  it('revokes a tertiary and kills its sessions', async () => {
    mockGetDevUser.mockResolvedValue({ id: 'dev1', access_level: 'secondary' });
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await PATCH(req({ id: USER, action: 'revoke' }, 'PATCH'));
    expect(res.status).toBe(200);
    // UPDATE + DELETE sessions.
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM sessions'))).toBe(true);
  });
});
