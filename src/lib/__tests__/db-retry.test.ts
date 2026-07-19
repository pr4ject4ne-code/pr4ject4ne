/**
 * Tests for the DB layer's transient-connection retry (auto-wakes a suspended
 * serverless DB instead of surfacing a 500 / empty page).
 */
const mockQuery = jest.fn();
const mockOn = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: (...a: unknown[]) => mockQuery(...a),
    on: (...a: unknown[]) => mockOn(...a),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@/lib/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
  errMessage: (e: unknown) => (e instanceof Error ? e.message : 'x'),
}));

import { query, closePool } from '@/lib/db';

function transient(msg = 'Connection terminated unexpectedly') {
  return new Error(msg);
}

beforeAll(() => {
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
});
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await closePool();
});

describe('db transient-connection retry', () => {
  it('retries a transient connection error and then succeeds', async () => {
    mockQuery
      .mockRejectedValueOnce(transient('Connection terminated due to connection timeout'))
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] });

    const res = await query('SELECT 1');
    expect(res.rows).toEqual([{ ok: 1 }]);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a non-transient (real SQL) error', async () => {
    mockQuery.mockRejectedValue(new Error('syntax error at or near "SLECT"'));

    await expect(query('SLECT 1')).rejects.toThrow(/syntax error/);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('gives up after 4 attempts if the DB never recovers', async () => {
    mockQuery.mockRejectedValue(transient());

    await expect(query('SELECT 1')).rejects.toThrow(/Connection terminated/);
    expect(mockQuery).toHaveBeenCalledTimes(4);
  }, 10000);

  it('registers a pool error handler so dead idle clients do not crash', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await query('SELECT 1');
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
