import { Pool, type QueryResultRow } from 'pg';

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
  }
  return pool;
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
  return getPool().query<T>(text, params as unknown[]);
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
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Close the pool (used in tests / graceful shutdown). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
