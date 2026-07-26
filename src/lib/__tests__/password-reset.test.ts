/**
 * Unit tests for password-reset token generation/consumption (worklist #19)
 * with the db layer mocked. Mirrors email-verification.test.ts's pattern.
 */
import {
  generateResetToken,
  createPasswordResetToken,
  consumePasswordResetToken,
} from '@/lib/password-reset';
import { hashToken } from '@/lib/auth';

const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: (...args: unknown[]) => mockWithTransaction(...args),
}));

describe('generateResetToken', () => {
  it('generates a long random hex string, different each call', () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe('createPasswordResetToken', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores a HASH of the token, never the raw token, with an expiry', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const token = await createPasswordResetToken('user-1');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO password_reset_tokens/);
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe(hashToken(token));
    expect(params[1]).not.toBe(token); // never the raw token
    expect(params[2]).toBeInstanceOf(Date);
  });

  it('sets a short (<=1h) expiry, unlike email verification\'s 48h window', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const before = Date.now();
    await createPasswordResetToken('user-1');
    const [, params] = mockQuery.mock.calls[0];
    const expiresAt = (params[2] as Date).getTime();
    expect(expiresAt - before).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(expiresAt - before).toBeGreaterThan(0);
  });
});

describe('consumePasswordResetToken', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockTxRows(rows: unknown[]) {
    mockWithTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = { query: jest.fn().mockResolvedValue({ rows }) };
      return fn(tx);
    });
  }

  const STRONG_PASSWORD = 'Str0ng!Pass';

  it('rejects an empty/missing token as invalid without touching the db', async () => {
    const result = await consumePasswordResetToken('', STRONG_PASSWORD);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('rejects a weak new password without touching the db (no token row lock held)', async () => {
    const result = await consumePasswordResetToken('sometoken', 'weak');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('weak_password');
    expect(result.message).toBeTruthy();
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('rejects a token with no matching row as invalid', async () => {
    mockTxRows([]);
    const result = await consumePasswordResetToken('sometoken', STRONG_PASSWORD);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an already-used token', async () => {
    mockTxRows([
      { id: 't1', user_id: 'u1', is_expired: false, used_at: new Date().toISOString() },
    ]);
    const result = await consumePasswordResetToken('sometoken', STRONG_PASSWORD);
    expect(result).toEqual({ ok: false, reason: 'used' });
  });

  it('rejects an expired token', async () => {
    // is_expired is computed in SQL (expires_at < now()) so the DB clock is
    // authoritative, mirroring email-verification.ts's pattern.
    mockTxRows([{ id: 't1', user_id: 'u1', is_expired: true, used_at: null }]);
    const result = await consumePasswordResetToken('sometoken', STRONG_PASSWORD);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('accepts a valid, unused, unexpired token: updates password hash, marks token used, and kills ALL sessions', async () => {
    const txQuery = jest.fn();
    mockWithTransaction.mockImplementation(async (fn: (tx: { query: typeof txQuery }) => unknown) => {
      txQuery
        .mockResolvedValueOnce({
          rows: [{ id: 't1', user_id: 'u1', is_expired: false, used_at: null }],
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE token used_at
        .mockResolvedValueOnce({ rows: [] }) // UPDATE users password_hash
        .mockResolvedValueOnce({ rows: [] }); // DELETE sessions
      return fn({ query: txQuery });
    });

    const result = await consumePasswordResetToken('sometoken', STRONG_PASSWORD);
    expect(result).toEqual({ ok: true, userId: 'u1' });
    expect(txQuery).toHaveBeenCalledTimes(4);
    expect(txQuery.mock.calls[1][0]).toMatch(/UPDATE password_reset_tokens SET used_at/);
    expect(txQuery.mock.calls[2][0]).toMatch(/UPDATE users SET password_hash/);
    // The new password hash is never the raw password.
    expect(txQuery.mock.calls[2][1][1]).not.toBe(STRONG_PASSWORD);
    expect(txQuery.mock.calls[3][0]).toMatch(/DELETE FROM sessions WHERE user_id = \$1/);
    expect(txQuery.mock.calls[3][1]).toEqual(['u1']);
  });
});
