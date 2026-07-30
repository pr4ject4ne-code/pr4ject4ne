/**
 * Tests for developer-account lifecycle (primary-only), focused on the
 * last-primary lockout guard added to PATCH.
 */
import { PATCH } from '@/app/api/dev/accounts/route';

const mockGetDevUser = jest.fn();
const mockIsPrimary = jest.fn();
const mockQuery = jest.fn();

jest.mock('@/lib/dev-auth', () => ({
  getDevUser: (...a: unknown[]) => mockGetDevUser(...a),
  isPrimary: (...a: unknown[]) => mockIsPrimary(...a),
}));
jest.mock('@/lib/db', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
}));
jest.mock('@/lib/auth', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
}));
jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
  clientIpFrom: () => null,
}));
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }));

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function req(body: unknown): Request {
  return new Request('http://localhost/api/dev/accounts', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDevUser.mockResolvedValue({ id: ACTOR, access_level: 'primary' });
  mockIsPrimary.mockReturnValue(true);
});

describe('last-primary guard (PATCH /api/dev/accounts)', () => {
  it('blocks revoking the last active primary with 409 LAST_PRIMARY', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('SELECT access_level'))
        return Promise.resolve({ rows: [{ access_level: 'primary', is_active: true }] });
      if (String(sql).includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
      return Promise.resolve({ rowCount: 1 });
    });
    const res = await PATCH(req({ id: TARGET, action: 'revoke' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('LAST_PRIMARY');
    // Must NOT have reached the DELETE.
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes('DELETE FROM users'))).toBe(false);
  });

  it('blocks demoting the last active primary', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('SELECT access_level'))
        return Promise.resolve({ rows: [{ access_level: 'primary', is_active: true }] });
      if (String(sql).includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
      return Promise.resolve({ rowCount: 1 });
    });
    const res = await PATCH(req({ id: TARGET, action: 'promote', level: 'secondary' }));
    expect(res.status).toBe(409);
  });

  it('blocks suspending the last active primary', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('SELECT access_level'))
        return Promise.resolve({ rows: [{ access_level: 'primary', is_active: true }] });
      if (String(sql).includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 0 }] });
      return Promise.resolve({ rowCount: 1 });
    });
    const res = await PATCH(req({ id: TARGET, action: 'suspend' }));
    expect(res.status).toBe(409);
  });

  it('ALLOWS revoking a primary when another active primary remains', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('SELECT access_level'))
        return Promise.resolve({ rows: [{ access_level: 'primary', is_active: true }] });
      if (String(sql).includes('COUNT(*)')) return Promise.resolve({ rows: [{ n: 1 }] });
      return Promise.resolve({ rowCount: 1 });
    });
    const res = await PATCH(req({ id: TARGET, action: 'revoke' }));
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes('DELETE FROM users'))).toBe(true);
  });

  it('ALLOWS revoking a secondary regardless of primary count', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('SELECT access_level'))
        return Promise.resolve({ rows: [{ access_level: 'secondary', is_active: true }] });
      return Promise.resolve({ rowCount: 1 });
    });
    const res = await PATCH(req({ id: TARGET, action: 'revoke' }));
    expect(res.status).toBe(200);
    // The primary-count query should not even run for a secondary target.
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes('COUNT(*)'))).toBe(false);
  });

  it('promote→primary is never blocked (grows the pool)', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await PATCH(req({ id: TARGET, action: 'promote', level: 'primary' }));
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes('COUNT(*)'))).toBe(false);
  });
});

describe('reset_totp (PATCH /api/dev/accounts)', () => {
  it('blocks resetting your OWN 2FA via this route (self-target guard)', async () => {
    const res = await PATCH(req({ id: ACTOR, action: 'reset_totp' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('SELF_CHANGE');
    // Must never have reached the UPDATE.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('403 when the caller is not a primary developer', async () => {
    mockIsPrimary.mockReturnValue(false);
    const res = await PATCH(req({ id: TARGET, action: 'reset_totp' }));
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('clears the TARGET (a different developer)\'s TOTP state and audits totp_reset_by_admin', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const res = await PATCH(req({ id: TARGET, action: 'reset_totp' }));
    expect(res.status).toBe(200);
    const updateCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE users'));
    expect(updateCall).toBeDefined();
    const [sql, values] = updateCall as [string, unknown[]];
    expect(sql).toContain('totp_enabled = false');
    expect(sql).toContain('totp_secret_encrypted = NULL');
    expect(sql).toContain('totp_recovery_codes = NULL');
    expect(values).toEqual([TARGET]);

    const { logAudit } = jest.requireMock('@/lib/audit') as { logAudit: jest.Mock };
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'totp_reset_by_admin', userId: ACTOR, resourceId: TARGET }),
    );
  });

  it('404 when the target developer does not exist', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const res = await PATCH(req({ id: TARGET, action: 'reset_totp' }));
    expect(res.status).toBe(404);
  });
});
