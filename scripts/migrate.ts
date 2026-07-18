/**
 * Minimal forward-only migration runner.
 *
 * Applies every `NNN_*.sql` file in `migrations/` (excluding `*.down.sql`) that
 * has not yet been recorded in the `schema_migrations` table, in filename order.
 *
 * The runner owns ONE transaction per migration that wraps both the migration
 * body and the `schema_migrations` tracking insert, so they commit atomically. If
 * the process dies mid-migration, the whole thing rolls back and re-runs cleanly —
 * a migration can never be applied without its tracking row (which, for the
 * non-idempotent DDL here, would otherwise wedge the next run on "already exists").
 * Any `BEGIN;`/`COMMIT;` a migration file self-manages is stripped first so it
 * nests inside the runner's transaction instead of committing early.
 *
 * Usage: npm run db:migrate
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

/**
 * Remove a leading `BEGIN;`/`START TRANSACTION;` and a trailing `COMMIT;` so a
 * self-transacting migration file nests inside the runner's transaction rather
 * than committing (and thus de-atomizing) early. Only strips outermost lines.
 */
function stripOuterTransaction(sql: string): string {
  return sql
    .replace(/^\s*(BEGIN|START\s+TRANSACTION)\s*;/i, '')
    .replace(/COMMIT\s*;\s*$/i, '');
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Configure .env.local first.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
        (r) => r.filename,
      ),
    );

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = stripOuterTransaction(readFileSync(join(migrationsDir, file), 'utf8'));
      console.warn(`Applying migration: ${file}`);
      // Body + tracking insert commit atomically inside a runner-owned transaction.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      count += 1;
    }

    console.warn(count === 0 ? 'No pending migrations.' : `Applied ${count} migration(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
