import { randomBytes } from 'node:crypto';
import { query, queryOne } from '@/lib/db';
import { apiError, apiOk, readJson, parseLimit, parseOffset } from '@/lib/api';
import { getDevUser } from '@/lib/dev-auth';
import { hashPassword } from '@/lib/auth';
import { isValidEmail } from '@/lib/validation';
import { logAudit, clientIpFrom } from '@/lib/audit';

/**
 * Tertiary (level-3) accounts = `hospital_staff`, provisioned by a developer
 * (primary OR secondary — both may create/oversee tertiaries) on behalf of an
 * institution. A tertiary manages only its own hospital's outlook; isolation is
 * enforced by the hospital portal via requireHospitalOwnership.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET — list tertiary accounts, optionally filtered by ?hospital_id=. Any dev. */
export async function GET(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'), 50, 200);
  const offset = parseOffset(url.searchParams.get('offset'));
  const hospitalId = url.searchParams.get('hospital_id');

  const params: unknown[] = [];
  let where = `WHERE u.account_type = 'hospital_staff'`;
  if (hospitalId && UUID_RE.test(hospitalId)) {
    params.push(hospitalId);
    where += ` AND u.hospital_id = $${params.length}`;
  }

  const totalRow = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM users u ${where}`,
    params,
  );
  const total = Number(totalRow.rows[0]?.count ?? '0');

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT u.id, u.email, u.hospital_id, u.is_active, u.last_login, u.created_at,
            h.name AS hospital_name
     FROM users u
     LEFT JOIN hospitals h ON h.id = u.hospital_id
     ${where}
     ORDER BY u.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return apiOk({ accounts: rows, total, limit, offset });
}

interface CreateBody {
  email?: string;
  hospital_id?: string;
}

/**
 * POST — create a tertiary (hospital_staff) account for a hospital. Any dev.
 * Returns a one-time temp password; the tertiary sets their own afterward.
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<CreateBody>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!isValidEmail(email)) return apiError('Invalid email.', 'INVALID_EMAIL', 400);
  if (!body.hospital_id || !UUID_RE.test(body.hospital_id)) {
    return apiError('A valid hospital_id is required.', 'BAD_REQUEST', 400);
  }

  // The target institution must exist.
  const hospital = await queryOne<{ id: string }>(`SELECT id FROM hospitals WHERE id = $1`, [
    body.hospital_id,
  ]);
  if (!hospital) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  const tempPassword = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(tempPassword);

  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, account_type, hospital_id, verified, created_by)
       VALUES ($1, $2, 'hospital_staff', $3, TRUE, $4) RETURNING id`,
      [email, passwordHash, body.hospital_id, dev.id],
    );
    const id = rows[0]!.id;
    await logAudit({
      userId: dev.id,
      action: 'tertiary_account_change',
      resourceType: 'user',
      resourceId: id,
      details: { op: 'create', email, hospital_id: body.hospital_id },
      ip: clientIpFrom(req.headers),
    });
    return apiOk({ success: true, id, temp_password: tempPassword }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('users_email_key')) {
      return apiError('Email already in use.', 'EMAIL_EXISTS', 409);
    }
    console.error('tertiary_create_failed', message);
    return apiError('Could not create account.', 'CREATE_FAILED', 500);
  }
}

interface PatchBody {
  id?: string;
  action?: 'revoke' | 'reactivate' | 'reset_password';
}

/** PATCH — revoke/reactivate a tertiary or reset its password. Any dev. */
export async function PATCH(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<PatchBody>(req);
  if (!body || !body.id || !UUID_RE.test(body.id) || !body.action) {
    return apiError('Invalid request.', 'BAD_REQUEST', 400);
  }

  if (body.action === 'revoke' || body.action === 'reactivate') {
    const active = body.action === 'reactivate';
    const { rowCount } = await query(
      `UPDATE users SET is_active = $2 WHERE id = $1 AND account_type = 'hospital_staff'`,
      [body.id, active],
    );
    if (!rowCount) return apiError('Tertiary account not found.', 'NOT_FOUND', 404);
    if (!active) await query('DELETE FROM sessions WHERE user_id = $1', [body.id]);
    await logAudit({
      userId: dev.id,
      action: 'tertiary_account_change',
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
  const { rowCount } = await query(
    `UPDATE users SET password_hash = $2 WHERE id = $1 AND account_type = 'hospital_staff'`,
    [body.id, passwordHash],
  );
  if (!rowCount) return apiError('Tertiary account not found.', 'NOT_FOUND', 404);
  await query('DELETE FROM sessions WHERE user_id = $1', [body.id]);
  await logAudit({
    userId: dev.id,
    action: 'tertiary_account_change',
    resourceType: 'user',
    resourceId: body.id,
    details: { op: 'reset_password' },
    ip: clientIpFrom(req.headers),
  });
  return apiOk({ success: true, temp_password: tempPassword });
}
