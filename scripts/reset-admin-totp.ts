/**
 * Out-of-band recovery: clear a developer's TOTP enrollment directly against
 * the database.
 *
 * The in-app `reset_totp` action (PATCH /api/dev/accounts) already lets one
 * primary rescue a DIFFERENT locked-out primary. This script exists for the
 * one case that can't reach: the SOLE primary loses both their authenticator
 * app and their recovery codes, and there is no other active primary to run
 * the in-app reset — the same "no way back in" scenario the last-primary-
 * lockout guard in PATCH /api/dev/accounts was built to prevent for account
 * suspension/revocation/demotion (see memory 2026-07-19).
 *
 * Idempotent — safe to re-run against an account that already has TOTP
 * disabled (no-ops with a warning instead of erroring).
 *
 * Usage (PowerShell):
 *   npx tsx scripts/reset-admin-totp.ts admin@example.com
 * or
 *   $env:RESET_ADMIN_TOTP_EMAIL='admin@example.com'
 *   npm run db:reset-admin-totp
 */
import { Pool } from 'pg';
import { isValidEmail } from '../src/lib/validation';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Configure .env.local first.');
    process.exit(1);
  }

  const email = (process.argv[2] ?? process.env.RESET_ADMIN_TOTP_EMAIL ?? '').trim();
  if (!isValidEmail(email)) {
    console.error('Provide a valid email as the first CLI argument or RESET_ADMIN_TOTP_EMAIL.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query<{ id: string; account_type: string; totp_enabled: boolean }>(
      'SELECT id, account_type, totp_enabled FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    if (!user) {
      console.error(`No account found for ${email}.`);
      process.exit(1);
    }
    if (user.account_type !== 'developer') {
      console.error(`Refusing: ${email} is a '${user.account_type}' account, not a developer.`);
      process.exit(1);
    }

    if (!user.totp_enabled) {
      console.warn(`${email} already has 2FA disabled — nothing to do.`);
    } else {
      await pool.query(
        `UPDATE users
         SET totp_secret_encrypted = NULL, totp_enabled = FALSE, totp_recovery_codes = NULL, totp_enrolled_at = NULL
         WHERE id = $1`,
        [user.id],
      );
      console.warn(`Cleared TOTP enrollment for ${email}.`);
    }

    // Self-referential, matching bootstrap-admin's audit convention for
    // scripts run out-of-band (there is no separate "acting admin" here).
    await pool.query(
      `INSERT INTO audit_logs (user_id, action_type, resource_type, resource_id, details, ip_address)
       VALUES ($1, 'totp_reset_by_admin', 'user', $2, $3, NULL)`,
      [user.id, user.id, JSON.stringify({ op: 'reset_admin_totp_script', email })],
    );

    console.warn('Done. Sign in at /login and re-enroll from /dev/primary if you still want 2FA.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
