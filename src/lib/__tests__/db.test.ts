import { getPool, closePool } from '@/lib/db';

describe('db helpers', () => {
  const original = process.env.DATABASE_URL;

  afterEach(async () => {
    process.env.DATABASE_URL = original;
    await closePool().catch(() => undefined);
  });

  it('throws a clear error when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => getPool()).toThrow(/DATABASE_URL is not set/);
  });
});
