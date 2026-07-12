/**
 * Tests for self-service password change (/api/account/password).
 */
import { PATCH } from '@/app/api/account/password/route';

const mockGetSession = jest.fn();
const mockFindUserById = jest.fn();
const mockVerifyPassword = jest.fn();
const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });

jest.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name === 'racoon_dev_session' ? { value: 'tok' } : undefined) }),
}));

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    ...actual,
    getSession: (...a: unknown[]) => mockGetSession(...a),
    findUserById: (...a: unknown[]) => mockFindUserById(...a),
    verifyPassword: (...a: unknown[]) => mockVerifyPassword(...a),
    hashPassword: jest.fn().mockResolvedValue('$2a$12$newhash'),
  };
});

jest.mock('@/lib/db', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));

function req(body: unknown): Request {
  return new Request('http://localhost/api/account/password', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

it('401 when there is no session', async () => {
  mockGetSession.mockResolvedValue(null);
  const res = await PATCH(req({ current_password: 'x', new_password: 'SecurePass123!' }));
  expect(res.status).toBe(401);
});

it('401 when the current password is wrong', async () => {
  mockGetSession.mockResolvedValue({ user_id: 'u1' });
  mockFindUserById.mockResolvedValue({ id: 'u1', account_type: 'developer', is_active: true, password_hash: 'h' });
  mockVerifyPassword.mockResolvedValue(false);
  const res = await PATCH(req({ current_password: 'wrong', new_password: 'SecurePass123!' }));
  expect(res.status).toBe(401);
});

it('400 when the new password is weak', async () => {
  mockGetSession.mockResolvedValue({ user_id: 'u1' });
  mockFindUserById.mockResolvedValue({ id: 'u1', account_type: 'developer', is_active: true, password_hash: 'h' });
  mockVerifyPassword.mockResolvedValue(true);
  const res = await PATCH(req({ current_password: 'ok', new_password: 'weak' }));
  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe('WEAK_PASSWORD');
});

it('changes the password and invalidates other sessions', async () => {
  mockGetSession.mockResolvedValue({ user_id: 'u1' });
  mockFindUserById.mockResolvedValue({ id: 'u1', account_type: 'developer', is_active: true, password_hash: 'h' });
  mockVerifyPassword.mockResolvedValue(true);
  const res = await PATCH(req({ current_password: 'ok', new_password: 'SecurePass123!' }));
  expect(res.status).toBe(200);
  const sqls = mockQuery.mock.calls.map(([s]) => String(s));
  expect(sqls.some((s) => s.includes('UPDATE users SET password_hash'))).toBe(true);
  expect(sqls.some((s) => s.includes('DELETE FROM sessions') && s.includes('token_hash <>'))).toBe(true);
});
