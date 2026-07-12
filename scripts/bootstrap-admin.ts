/**
 * Bootstrap the first admin developer account.
 *
 * Every developer-account endpoint (`/api/dev/accounts`) requires an *existing*
 * admin, so there is a chicken-and-egg problem: a fresh database has no way to
 * reach the primary-dev admin hub. This one-off script breaks that cycle by
 * creating (or promoting) a single `access_level = 'admin'` developer directly
 * against the database.
 *
 * Credentials are read from the environment — NEVER hardcoded and never echoed
 * back — mirroring the "credentials via secrets, not code" rule the dev portal
 * follows everywhere else:
 *
 *   BOOTSTRAP_ADMIN_EMAIL     required — the admin's login email
 *   BOOTSTRAP_ADMIN_PASSWORD  required — must satisfy the app password policy
 *
 * Creates the level-1 **primary** developer (the executive account that manages
 * all other levels). The password policy is intentionally NOT enforced here — the
 * bootstrap value is meant to be rotated from the dev page after first login — but
 * a weak one is warned about.
 *
 * Behaviour is idempotent and safe to re-run:
 *   - No user with that email        → creates a new primary developer.
 *   - Existing *developer*           → promotes to primary, reactivates, and
 *                                       resets the password to the supplied one.
 *   - Existing patient/hospital user → refuses (won't hijack another account).
 *
 * Usage (PowerShell):
 *   $env:BOOTSTRAP_ADMIN_EMAIL='admin@example.com'
 *   $env:BOOTSTRAP_ADMIN_PASSWORD='<strong-password>'
 *   npm run db:bootstrap-admin
 *
 * Rotate the password from the primary-dev hub after first login.
 */
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { isValidEmail, validatePasswordStrength } from '../src/lib/validation';

const BCRYPT_ROUNDS = 12;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Configure .env.local first.');
    process.exit(1);
  }

  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';

  if (!isValidEmail(email)) {
    console.error('BOOTSTRAP_ADMIN_EMAIL is missing or not a valid email address.');
    process.exit(1);
  }
  if (!password || password.length < 6) {
    console.error('BOOTSTRAP_ADMIN_PASSWORD is missing or shorter than 6 characters.');
    process.exit(1);
  }
  const strength = validatePasswordStrength(password);
  if (!strength.ok) {
    // Not fatal for the bootstrap — this account rotates its password in-app —
    // but make the weakness loud.
    console.warn(`WARNING: bootstrap password is weak (${strength.reason}). Rotate it after first login.`);
  }

  const pool = new Pool({ connectionString });
  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { rows: existing } = await pool.query<{ id: string; account_type: string }>(
      'SELECT id, account_type FROM users WHERE email = $1',
      [email],
    );

    if (existing.length > 0) {
      const user = existing[0]!;
      if (user.account_type !== 'developer') {
        console.error(
          `Refusing to bootstrap: ${email} already exists as a '${user.account_type}' account. ` +
            'Use a different email for the admin developer.',
        );
        process.exit(1);
      }
      await pool.query(
        `UPDATE users
         SET access_level = 'primary', is_active = TRUE, password_hash = $2
         WHERE id = $1`,
        [user.id, passwordHash],
      );
      // Invalidate any live sessions so the reset password takes effect everywhere.
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      console.warn(`Promoted existing developer ${email} to primary and reset its password.`);
    } else {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, account_type, access_level, is_active)
         VALUES ($1, $2, 'developer', 'primary', TRUE)
         RETURNING id`,
        [email, passwordHash],
      );
      console.warn(`Created primary developer ${email} (id ${rows[0]!.id}).`);
    }

    // Record the bootstrap in the audit trail (self-referential: the admin acted).
    const { rows: idRow } = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    const adminId = idRow[0]!.id;
    await pool.query(
      `INSERT INTO audit_logs (user_id, action_type, resource_type, resource_id, details, ip_address)
       VALUES ($1, 'dev_account_change', 'user', $2, $3, NULL)`,
      [adminId, adminId, JSON.stringify({ op: 'bootstrap_admin', email })],
    );

    console.warn('Done. Log in at /login, then manage accounts at /dev/primary.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
