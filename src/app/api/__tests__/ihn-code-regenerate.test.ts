/**
 * Tests for /api/biodata/ihn-code/regenerate (founder ask, 2026-07-29 — not a
 * numbered worklist item): a patient can regenerate their own IHN code, at
 * most once every 30 days, and only after confirming their current password.
 */
import { POST } from '@/app/api/biodata/ihn-code/regenerate/route';

const mockGetPatientSession = jest.fn();
const mockFindUserById = jest.fn();
const mockVerifyPassword = jest.fn();
const mockCheckRateLimit = jest.fn().mockResolvedValue(true);
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();

jest.mock('next/headers', () => ({
  cookies: () => ({ get: () => ({ value: 'session-token' }) }),
}));

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    getPatientSession: (...a: unknown[]) => mockGetPatientSession(...a),
    findUserById: (...a: unknown[]) => mockFindUserById(...a),
    verifyPassword: (...a: unknown[]) => mockVerifyPassword(...a),
    checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
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

const USER_ID = '11111111-1111-4111-8111-111111111111';

function req(body: unknown): Request {
  return new Request('http://localhost/api/biodata/ihn-code/regenerate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(true);
});

it('401 when there is no patient session', async () => {
  mockGetPatientSession.mockResolvedValue(null);
  const res = await POST(req({ current_password: 'x' }));
  expect(res.status).toBe(401);
});

it('429 when rate limited', async () => {
  mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
  mockCheckRateLimit.mockResolvedValue(false);
  const res = await POST(req({ current_password: 'x' }));
  expect(res.status).toBe(429);
});

it('401 when the current password is wrong', async () => {
  mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
  mockFindUserById.mockResolvedValue({ id: USER_ID, is_active: true, password_hash: 'h' });
  mockVerifyPassword.mockResolvedValue(false);
  const res = await POST(req({ current_password: 'wrong' }));
  expect(res.status).toBe(401);
  expect((await res.json()).code).toBe('INVALID_CREDENTIALS');
});

it('429 with days remaining when regenerated within the last 30 days', async () => {
  mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
  mockFindUserById.mockResolvedValue({ id: USER_ID, is_active: true, password_hash: 'h' });
  mockVerifyPassword.mockResolvedValue(true);
  // The cooldown-enforcing UPDATE's WHERE clause matches zero rows...
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  // ...so the route falls back to a SELECT to build the "N days left" message.
  mockQueryOne.mockResolvedValue({ ihn_code_regenerated_at: daysAgo(10), created_at: daysAgo(400) });
  const res = await POST(req({ current_password: 'ok' }));
  expect(res.status).toBe(429);
  const body = await res.json();
  expect(body.code).toBe('COOLDOWN_ACTIVE');
  expect(body.error).toMatch(/20 days/);
});

it('falls back to created_at for the cooldown when never regenerated', async () => {
  mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
  mockFindUserById.mockResolvedValue({ id: USER_ID, is_active: true, password_hash: 'h' });
  mockVerifyPassword.mockResolvedValue(true);
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockQueryOne.mockResolvedValue({ ihn_code_regenerated_at: null, created_at: daysAgo(5) });
  const res = await POST(req({ current_password: 'ok' }));
  expect(res.status).toBe(429);
  expect((await res.json()).code).toBe('COOLDOWN_ACTIVE');
});

it('404 when the cooldown-enforcing update matches nothing and the row does not exist', async () => {
  mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
  mockFindUserById.mockResolvedValue({ id: USER_ID, is_active: true, password_hash: 'h' });
  mockVerifyPassword.mockResolvedValue(true);
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockQueryOne.mockResolvedValue(null);
  const res = await POST(req({ current_password: 'ok' }));
  expect(res.status).toBe(404);
});

it('regenerates the code when eligible and returns the new one, atomically in the UPDATE itself', async () => {
  mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
  mockFindUserById.mockResolvedValue({ id: USER_ID, is_active: true, password_hash: 'h' });
  mockVerifyPassword.mockResolvedValue(true);
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

  const res = await POST(req({ current_password: 'ok' }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ihn_code).toMatch(/^IHN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const sqls = mockQuery.mock.calls.map(([s]) => String(s));
  // The cooldown check lives in the same statement's WHERE clause, not a
  // separate read beforehand — no queryOne call on the success path.
  expect(sqls.some((s) => s.includes('UPDATE biodata') && s.includes('WHERE user_id') && s.includes("interval '30 days'"))).toBe(true);
  expect(mockQueryOne).not.toHaveBeenCalled();
});

it('retries on a code collision and still succeeds', async () => {
  mockGetPatientSession.mockResolvedValue({ user_id: USER_ID });
  mockFindUserById.mockResolvedValue({ id: USER_ID, is_active: true, password_hash: 'h' });
  mockVerifyPassword.mockResolvedValue(true);
  mockQuery
    .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "biodata_ihn_code_key"'))
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  const res = await POST(req({ current_password: 'ok' }));
  expect(res.status).toBe(200);
  expect(mockQuery).toHaveBeenCalledTimes(2);
});
