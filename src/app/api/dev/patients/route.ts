import { randomBytes } from 'node:crypto';
import { query, queryOne } from '@/lib/db';
import { apiError, apiOk, readJson, parseLimit, parseOffset } from '@/lib/api';
import { getDevUser } from '@/lib/dev-auth';
import { hashPassword } from '@/lib/auth';
import { escapeLikePattern } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';

/**
 * Item 6: patient (`account_type = 'patient'`) account management — revoke,
 * reactivate, or reset the password on a patient's own account. Deliberately
 * mirrors /api/dev/tertiary's shape (same actions, same "any dev, primary or
 * secondary" authorization, same append-nothing-just-flip-a-column pattern)
 * since item 6's policy is that secondary devs have the SAME authority as
 * primary over both hospital admins (tertiary) AND patients (this route) —
 * only actions on OTHER DEVELOPER accounts stay primary-only
 * (/api/dev/accounts).
 *
 * SCOPED TO THE ACCOUNT, NOT THE MEDICAL RECORD: this can suspend/reactivate
 * a login and force a password reset, exactly like the tertiary route can
 * for hospital staff — it does NOT let a developer read or edit a patient's
 * biodata_layer. That data is owned by the patient (see biodata/me's own
 * "the owner still sees the FULL biodata_layer... prefs never gate the
 * owner" precedent) and stays out of dev reach entirely; "alter" in item 6
 * is read here as accounts, matching the only precedent that already exists
 * for hospital admins, not as dev-editable medical records.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET ?q= — search/list patient accounts by email. Any dev, primary or secondary. */
export async function GET(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'), 50, 200);
  const offset = parseOffset(url.searchParams.get('offset'));
  const q = (url.searchParams.get('q') ?? '').trim();

  const params: unknown[] = [];
  let where = `WHERE account_type = 'patient'`;
  if (q) {
    params.push(`%${escapeLikePattern(q)}%`);
    where += ` AND email ILIKE $${params.length} ESCAPE '\\'`;
  }

  const totalRow = await query<{ count: string }>(`SELECT count(*)::text AS count FROM users ${where}`, params);
  const total = Number(totalRow.rows[0]?.count ?? '0');

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT id, email, is_active, last_login, created_at
     FROM users
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return apiOk({ accounts: rows, total, limit, offset });
}

interface PatchBody {
  id?: string;
  action?: 'revoke' | 'reactivate' | 'reset_password';
}

/** PATCH — revoke/reactivate a patient account or reset its password. Any dev,
 *  primary or secondary (item 6), fully audit-logged. */
export async function PATCH(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<PatchBody>(req);
  if (!body || !body.id || !UUID_RE.test(body.id) || !body.action) {
    return apiError('Invalid request.', 'BAD_REQUEST', 400);
  }

  const exists = await queryOne<{ id: string }>(`SELECT id FROM users WHERE id = $1 AND account_type = 'patient'`, [body.id]);
  if (!exists) return apiError('Patient account not found.', 'NOT_FOUND', 404);

  if (body.action === 'revoke' || body.action === 'reactivate') {
    const active = body.action === 'reactivate';
    await query(`UPDATE users SET is_active = $2 WHERE id = $1`, [body.id, active]);
    if (!active) await query('DELETE FROM sessions WHERE user_id = $1', [body.id]);
    await logAudit({
      userId: dev.id,
      action: 'patient_account_change',
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
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [body.id, passwordHash]);
  await query('DELETE FROM sessions WHERE user_id = $1', [body.id]);
  await logAudit({
    userId: dev.id,
    action: 'patient_account_change',
    resourceType: 'user',
    resourceId: body.id,
    details: { op: 'reset_password' },
    ip: clientIpFrom(req.headers),
  });
  return apiOk({ success: true, temp_password: tempPassword });
}
