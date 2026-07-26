/**
 * Unit tests for email verification token generation/consumption
 * (worklist #18) with the db layer mocked.
 */
import {
  generateVerificationToken,
  createEmailVerificationToken,
  consumeEmailVerificationToken,
} from '@/lib/email-verification';
import { hashToken } from '@/lib/auth';

const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();

jest.mock('@/lib/db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  withTransaction: (...args: unknown[]) => mockWithTransaction(...args),
}));

describe('generateVerificationToken', () => {
  it('generates a long random hex string, different each call', () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe('createEmailVerificationToken', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores a HASH of the token, never the raw token, with an expiry', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const token = await createEmailVerificationToken('user-1');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO email_verification_tokens/);
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe(hashToken(token));
    expect(params[1]).not.toBe(token); // never the raw token
    expect(params[2]).toBeInstanceOf(Date);
  });
});

describe('consumeEmailVerificationToken', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockTxRows(rows: unknown[]) {
    mockWithTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = { query: jest.fn().mockResolvedValue({ rows }) };
      return fn(tx);
    });
  }

  it('rejects an empty/missing token as invalid without touching the db', async () => {
    const result = await consumeEmailVerificationToken('');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('rejects a token with no matching row as invalid', async () => {
    mockTxRows([]);
    const result = await consumeEmailVerificationToken('sometoken');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an already-used token', async () => {
    mockTxRows([
      { id: 't1', user_id: 'u1', expires_at: new Date(Date.now() + 1000).toISOString(), used_at: new Date().toISOString() },
    ]);
    const result = await consumeEmailVerificationToken('sometoken');
    expect(result).toEqual({ ok: false, reason: 'used' });
  });

  it('rejects an expired token', async () => {
    mockTxRows([
      { id: 't1', user_id: 'u1', expires_at: new Date(Date.now() - 1000).toISOString(), used_at: null },
    ]);
    const result = await consumeEmailVerificationToken('sometoken');
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('accepts a valid, unused, unexpired token and marks it used + verifies the user', async () => {
    const txQuery = jest.fn();
    mockWithTransaction.mockImplementation(async (fn: (tx: { query: typeof txQuery }) => unknown) => {
      txQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 't1',
              user_id: 'u1',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              used_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE token
        .mockResolvedValueOnce({ rows: [] }); // UPDATE user
      return fn({ query: txQuery });
    });

    const result = await consumeEmailVerificationToken('sometoken');
    expect(result).toEqual({ ok: true, userId: 'u1' });
    expect(txQuery).toHaveBeenCalledTimes(3);
    expect(txQuery.mock.calls[1][0]).toMatch(/UPDATE email_verification_tokens SET used_at/);
    expect(txQuery.mock.calls[2][0]).toMatch(/UPDATE users SET email_verified = true/);
  });
});
