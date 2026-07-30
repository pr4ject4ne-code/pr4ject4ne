import { randomBytes } from 'node:crypto';
import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getDevUser, isPrimary } from '@/lib/dev-auth';
import { hashPassword } from '@/lib/auth';
import { isValidEmail } from '@/lib/validation';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { logger } from '@/lib/logger';

/** GET — list developer (primary + secondary) accounts. Primary only. */
export async function GET() {
  const dev = await getDevUser();
  if (!dev || !isPrimary(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const { rows } = await query(
    `SELECT id, email, access_level, is_active, last_login, created_at, totp_enabled
     FROM users WHERE account_type = 'developer' ORDER BY created_at DESC`,
  );
  return apiOk({ accounts: rows });
}

interface CreateBody {
  email?: string;
  access_level?: 'primary' | 'secondary';
}

/**
 * POST — create a developer account (**level-1 primary only**). A level-1 admin
 * can mint another level-1 (primary) or a level-2 (secondary); `access_level`
 * selects which, defaulting to secondary. Generates a strong temporary password,
 * returns it ONCE (never stored in plaintext); the new dev sets their own from
 * the dev page afterward.
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  if (!dev || !isPrimary(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<CreateBody>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!isValidEmail(email)) return apiError('Invalid email.', 'INVALID_EMAIL', 400);
  const level = body.access_level === 'primary' ? 'primary' : 'secondary';

  // Strong random temp password shown once.
  const tempPassword = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(tempPassword);

  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, account_type, access_level, created_by)
       VALUES ($1, $2, 'developer', $3, $4) RETURNING id`,
      [email, passwordHash, level, dev.id],
    );
    const id = rows[0]!.id;
    await logAudit({
      userId: dev.id,
      action: 'dev_account_change',
      resourceType: 'user',
      resourceId: id,
      details: { op: 'create', email, access_level: level },
      ip: clientIpFrom(req.headers),
    });
    return apiOk({ success: true, id, temp_password: tempPassword }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('users_email_key')) {
      return apiError('Email already in use.', 'EMAIL_EXISTS', 409);
    }
    logger.error('dev_account_create_failed', { error: message });
    return apiError('Could not create account.', 'CREATE_FAILED', 500);
  }
}

interface PatchBody {
  id?: string;
  action?: 'suspend' | 'reactivate' | 'revoke' | 'promote' | 'reset_password' | 'reset_totp';
  /** For 'promote': the target access level to set. */
  level?: 'primary' | 'secondary';
}

/**
 * Count active primary developers OTHER than `excludeId`. Used to enforce the
 * last-primary invariant: the system must never be left with zero active
 * primaries (admin lockout). If this returns 0, `excludeId` is the last one.
 */
async function otherActivePrimaries(excludeId: string): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM users
     WHERE account_type = 'developer' AND access_level = 'primary'
       AND is_active = true AND id <> $1`,
    [excludeId],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * PATCH — level-1 (primary) developer lifecycle actions over other devs, all
 * gated to primary only:
 *   suspend      — temporarily deactivate (is_active=false), kills sessions
 *   reactivate   — undo a suspend
 *   promote      — change access level (secondary <-> primary) via `level`
 *   revoke       — permanently delete the developer account (FKs cascade/null)
 *   reset_password — issue a new one-time temp password
 *   reset_totp   — clear another developer's 2FA enrollment (migration 021's
 *                   "one primary rescues a different locked-out primary" path
 *                   — a primary who lost their authenticator app + recovery
 *                   codes can't clear their OWN enrollment via this route)
 * A primary can never suspend/revoke/promote/reset_totp their own account.
 */
export async function PATCH(req: Request) {
  const dev = await getDevUser();
  if (!dev || !isPrimary(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<PatchBody>(req);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!body || !body.id || !UUID_RE.test(body.id) || !body.action) {
    return apiError('Invalid request.', 'BAD_REQUEST', 400);
  }
  const selfChanging = body.id === dev.id;
  if (
    selfChanging &&
    (body.action === 'revoke' ||
      body.action === 'suspend' ||
      body.action === 'promote' ||
      body.action === 'reset_totp')
  ) {
    return apiError('You cannot change your own account here.', 'SELF_CHANGE', 400);
  }

  // Last-primary invariant: reject any op that would drop active primaries to
  // zero. Revoke (delete), suspend (deactivate), and demote (promote→secondary)
  // all shrink the active-primary pool; guard them when the target is itself an
  // active primary and no other active primary remains.
  const demoting = body.action === 'promote' && body.level === 'secondary';
  if (body.action === 'revoke' || body.action === 'suspend' || demoting) {
    const { rows } = await query<{ access_level: string; is_active: boolean }>(
      `SELECT access_level, is_active FROM users
       WHERE id = $1 AND account_type = 'developer'`,
      [body.id],
    );
    const target = rows[0];
    if (target && target.access_level === 'primary') {
      // Suspending an already-inactive primary changes no active count.
      const reducesActive = body.action !== 'suspend' || target.is_active;
      if (reducesActive && (await otherActivePrimaries(body.id)) === 0) {
        return apiError(
          'Cannot remove the last active primary. Promote another developer to primary first.',
          'LAST_PRIMARY',
          409,
        );
      }
    }
  }

  if (body.action === 'suspend' || body.action === 'reactivate') {
    const active = body.action === 'reactivate';
    const { rowCount } = await query(
      `UPDATE users SET is_active = $2 WHERE id = $1 AND account_type = 'developer'`,
      [body.id, active],
    );
    if (!rowCount) return apiError('Developer account not found.', 'NOT_FOUND', 404);
    // Suspending kills existing sessions.
    if (!active) await query('DELETE FROM sessions WHERE user_id = $1', [body.id]);
    await logAudit({
      userId: dev.id,
      action: 'dev_account_change',
      resourceType: 'user',
      resourceId: body.id,
      details: { op: body.action },
      ip: clientIpFrom(req.headers),
    });
    return apiOk({ success: true });
  }

  if (body.action === 'promote') {
    const level = body.level === 'primary' ? 'primary' : body.level === 'secondary' ? 'secondary' : null;
    if (!level) return apiError('A target level is required.', 'BAD_REQUEST', 400);
    const { rowCount } = await query(
      `UPDATE users SET access_level = $2 WHERE id = $1 AND account_type = 'developer'`,
      [body.id, level],
    );
    if (!rowCount) return apiError('Developer account not found.', 'NOT_FOUND', 404);
    await logAudit({
      userId: dev.id,
      action: 'dev_account_change',
      resourceType: 'user',
      resourceId: body.id,
      details: { op: 'promote', access_level: level },
      ip: clientIpFrom(req.headers),
    });
    return apiOk({ success: true });
  }

  if (body.action === 'revoke') {
    // Permanent removal. FKs to users(id) are ON DELETE CASCADE (sessions) or
    // SET NULL (audit_logs, first_aid_entries, suggestions, users.created_by),
    // so a plain delete detaches everything and preserves the audit trail.
    const { rowCount } = await query(
      `DELETE FROM users WHERE id = $1 AND account_type = 'developer'`,
      [body.id],
    );
    if (!rowCount) return apiError('Developer account not found.', 'NOT_FOUND', 404);
    await logAudit({
      userId: dev.id,
      action: 'dev_account_change',
      resourceType: 'user',
      resourceId: body.id,
      details: { op: 'revoke' },
      ip: clientIpFrom(req.headers),
    });
    return apiOk({ success: true });
  }

  if (body.action === 'reset_totp') {
    const { rowCount } = await query(
      `UPDATE users
       SET totp_secret_encrypted = NULL, totp_enabled = false, totp_recovery_codes = NULL, totp_enrolled_at = NULL
       WHERE id = $1 AND account_type = 'developer'`,
      [body.id],
    );
    if (!rowCount) return apiError('Developer account not found.', 'NOT_FOUND', 404);
    await logAudit({
      userId: dev.id,
      action: 'totp_reset_by_admin',
      resourceType: 'user',
      resourceId: body.id,
      ip: clientIpFrom(req.headers),
    });
    return apiOk({ success: true });
  }

  if (body.action !== 'reset_password') {
    return apiError('Unknown action.', 'BAD_REQUEST', 400);
  }

  // reset_password
  const tempPassword = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(tempPassword);
  const { rowCount } = await query(
    `UPDATE users SET password_hash = $2 WHERE id = $1 AND account_type = 'developer'`,
    [body.id, passwordHash],
  );
  if (!rowCount) return apiError('Developer account not found.', 'NOT_FOUND', 404);
  await query('DELETE FROM sessions WHERE user_id = $1', [body.id]);
  await logAudit({
    userId: dev.id,
    action: 'dev_account_change',
    resourceType: 'user',
    resourceId: body.id,
    details: { op: 'reset_password' },
    ip: clientIpFrom(req.headers),
  });
  return apiOk({ success: true, temp_password: tempPassword });
}
