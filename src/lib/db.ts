import { Pool, type QueryResultRow } from 'pg';
import { logger, errMessage } from './logger';

/**
 * PostgreSQL connection pool + parameterized query helpers.
 *
 * SECURITY: Only ever pass values through the `params` array so pg parameterizes
 * them ($1, $2, ...). Never interpolate user input into the SQL string. String
 * interpolation of untrusted data into SQL is a SQL-injection vector.
 */

let pool: Pool | null = null;

/** Lazily create the shared pool so importing this module never crashes at build time. */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and configure it.');
    }
    pool = new Pool({
      connectionString,
      // Fail fast rather than hanging on a dead database.
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10,
    });
    // Serverless Postgres (Neon) drops idle connections when it auto-suspends.
    // Without this handler an errored idle client would surface as an
    // 'uncaughtException' and crash the process; with it, pg evicts the dead
    // client from the pool so the next acquire gets a fresh one (this is what
    // clears the "poisoned pool keeps failing after a DB blip" state).
    pool.on('error', (err) => {
      logger.warn('db_idle_client_error', { error: errMessage(err) });
    });
  }
  return pool;
}

/**
 * Whether an error is a transient connection failure worth retrying — chiefly a
 * serverless DB that auto-suspended and needs a moment to wake, or a briefly
 * dropped/timed-out socket. Query errors (bad SQL, constraint violations) are
 * NOT transient and must surface immediately.
 */
function isTransientConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { message, code } = err as { message?: string; code?: string };
  const msg = (message ?? '').toLowerCase();
  return (
    msg.includes('connection terminated') ||
    msg.includes('connection timeout') ||
    msg.includes('timeout exceeded when trying to connect') ||
    msg.includes('terminating connection') ||
    msg.includes('server closed the connection') ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' || // transient DNS flap (seen on the pooler host)
    code === '57P01' || // admin_shutdown
    code === '57P03' // cannot_connect_now (server still starting up)
  );
}

const DB_MAX_ATTEMPTS = 4;
const DB_RETRY_BASE_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a DB operation, transparently retrying transient connection failures with
 * exponential backoff. This is what lets a cold serverless DB wake up on the
 * first request instead of surfacing an empty page / 500 to the user. Backoff:
 * ~300ms, 600ms, 1200ms across up to 4 attempts (~2.1s worst case before a
 * genuine failure propagates).
 */
async function withDbRetry<T>(op: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= DB_MAX_ATTEMPTS; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (!isTransientConnectionError(err) || attempt === DB_MAX_ATTEMPTS) throw err;
      logger.warn('db_transient_retry', { label, attempt, error: errMessage(err) });
      await sleep(DB_RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

/**
 * Run a parameterized query. Always prefer this over touching the pool directly.
 *
 * @example
 *   const { rows } = await query<User>('SELECT * FROM users WHERE email = $1', [email]);
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
) {
  return withDbRetry(() => getPool().query<T>(text, params as unknown[]), 'query');
}

/** Convenience: return the first row or null. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T | null> {
  const { rows } = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run a set of statements inside a single transaction. The callback receives a
 * scoped `query` function bound to the transaction's client.
 */
export async function withTransaction<T>(
  fn: (tx: {
    query: <R extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: ReadonlyArray<unknown>,
    ) => Promise<{ rows: R[] }>;
  }) => Promise<T>,
): Promise<T> {
  // Retried as a whole: a transient connection failure rolls the transaction
  // back (nothing committed), so re-running the callback on a fresh client is
  // safe. Callbacks here do DB work only — keep it that way so retries stay safe.
  return withDbRetry(async () => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn({
        query: <R extends QueryResultRow = QueryResultRow>(
          text: string,
          params: ReadonlyArray<unknown> = [],
        ) => client.query<R>(text, params as unknown[]).then((r) => ({ rows: r.rows })),
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      // Best-effort rollback; ignore failures (the connection may already be dead).
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }, 'transaction');
}

/** Close the pool (used in tests / graceful shutdown). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
