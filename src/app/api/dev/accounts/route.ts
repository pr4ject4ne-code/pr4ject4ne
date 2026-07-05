import { randomBytes } from 'node:crypto';
import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getDevUser, isAdmin } from '@/lib/dev-auth';
import { hashPassword } from '@/lib/auth';
import { isValidEmail } from '@/lib/validation';
import { logAudit, clientIpFrom } from '@/lib/audit';

/** GET — list developer accounts (admin only). */
export async function GET() {
  const dev = await getDevUser();
  if (!dev || !isAdmin(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const { rows } = await query(
    `SELECT id, email, access_level, is_active, last_login, created_at
     FROM users WHERE account_type = 'developer' ORDER BY created_at DESC`,
  );
  return apiOk({ accounts: rows });
}

interface CreateBody {
  email?: string;
  access_level?: string;
}

/**
 * POST — create a developer account (admin only). Generates a strong temporary
 * password, returns it ONCE (never stored in plaintext), and the dev must save it.
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  if (!dev || !isAdmin(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<CreateBody>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!isValidEmail(email)) return apiError('Invalid email.', 'INVALID_EMAIL', 400);

  const accessLevel = body.access_level === 'admin' ? 'admin' : 'first_aid_editor';

  // Strong random temp password shown once.
  const tempPassword = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(tempPassword);

  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, account_type, access_level, created_by)
       VALUES ($1, $2, 'developer', $3, $4) RETURNING id`,
      [email, passwordHash, accessLevel, dev.id],
    );
    const id = rows[0]!.id;
    await logAudit({
      userId: dev.id,
      action: 'dev_account_change',
      resourceType: 'user',
      resourceId: id,
      details: { op: 'create', email, access_level: accessLevel },
      ip: clientIpFrom(req.headers),
    });
    return apiOk({ success: true, id, temp_password: tempPassword }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('users_email_key')) {
      return apiError('Email already in use.', 'EMAIL_EXISTS', 409);
    }
    console.error('dev_account_create_failed', message);
    return apiError('Could not create account.', 'CREATE_FAILED', 500);
  }
}

interface PatchBody {
  id?: string;
  action?: 'revoke' | 'reactivate' | 'reset_password';
}

/** PATCH — revoke/reactivate an account or reset its password (admin only). */
export async function PATCH(req: Request) {
  const dev = await getDevUser();
  if (!dev || !isAdmin(dev)) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<PatchBody>(req);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!body || !body.id || !UUID_RE.test(body.id) || !body.action) {
    return apiError('Invalid request.', 'BAD_REQUEST', 400);
  }
  if (body.id === dev.id && body.action === 'revoke') {
    return apiError('You cannot revoke your own account.', 'SELF_REVOKE', 400);
  }

  if (body.action === 'revoke' || body.action === 'reactivate') {
    const active = body.action === 'reactivate';
    await query(`UPDATE users SET is_active = $2 WHERE id = $1 AND account_type = 'developer'`, [
      body.id,
      active,
    ]);
    // Revoking kills existing sessions.
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

  // reset_password
  const tempPassword = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(tempPassword);
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1 AND account_type = 'developer'`, [
    body.id,
    passwordHash,
  ]);
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
