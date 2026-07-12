/**
 * Integration tests against a REAL Postgres (DATABASE_URL). Run with
 * `npm run test:integration`. They exercise SQL the mocked unit suite cannot:
 * the advisory-lock rate limiter, real session rows, and the trigram search path.
 * Each test uses random identifiers and cleans up after itself.
 *
 * Skips entirely when DATABASE_URL is unset so a DB-less checkout stays green.
 */
import { randomUUID } from 'node:crypto';
import { query, closePool } from '@/lib/db';
import { checkRateLimit, createSession, getSession, destroySession } from '@/lib/auth';

const hasDb = Boolean(process.env.DATABASE_URL);
const d = hasDb ? describe : describe.skip;

afterAll(async () => {
  if (hasDb) await closePool();
});

d('schema smoke', () => {
  it('connects and the core tables exist', async () => {
    const { rows } = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.tables WHERE table_name = ANY($1)`,
      [['users', 'sessions', 'hospitals', 'rate_limit_events', 'audit_logs', 'biodata', 'first_aid_entries']],
    );
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(7);
  });
});

d('checkRateLimit (advisory-lock limiter)', () => {
  const bucket = `itest:${randomUUID()}`;
  afterAll(async () => {
    await query('DELETE FROM rate_limit_events WHERE bucket_key = $1', [bucket]);
  });

  it('allows up to the limit, then blocks', async () => {
    expect(await checkRateLimit(bucket, 3, 300)).toBe(true);
    expect(await checkRateLimit(bucket, 3, 300)).toBe(true);
    expect(await checkRateLimit(bucket, 3, 300)).toBe(true);
    expect(await checkRateLimit(bucket, 3, 300)).toBe(false);
  });
});

d('session lifecycle', () => {
  let userId = '';
  beforeAll(async () => {
    const email = `itest+${randomUUID()}@example.com`;
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, account_type) VALUES ($1, 'x', 'patient') RETURNING id`,
      [email],
    );
    userId = rows[0]!.id;
  });
  afterAll(async () => {
    if (userId) await query('DELETE FROM users WHERE id = $1', [userId]); // cascades sessions
  });

  it('creates, resolves, and destroys a real session', async () => {
    const { token } = await createSession(userId, 'patient');
    const resolved = await getSession(token);
    expect(resolved?.user_id).toBe(userId);
    expect(resolved?.account_type).toBe('patient');

    await destroySession(token);
    expect(await getSession(token)).toBeNull();
  });
});

d('trigram search path', () => {
  const id = randomUUID();
  const name = `ZzTrigramClinic-${id}`;
  beforeAll(async () => {
    await query(
      `INSERT INTO hospitals (id, name, service_type, status) VALUES ($1, $2, 'hospital', 'approved')`,
      [id, name],
    );
  });
  afterAll(async () => {
    await query('DELETE FROM hospitals WHERE id = $1', [id]);
  });

  it('finds a hospital by a leading-wildcard ILIKE (trigram-backed)', async () => {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM hospitals WHERE name ILIKE $1 ESCAPE '\\'`,
      ['%TrigramClinic%'],
    );
    expect(rows.some((r) => r.id === id)).toBe(true);
  });
});
