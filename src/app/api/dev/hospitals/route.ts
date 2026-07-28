import { query, queryOne } from '@/lib/db';
import { apiError, apiOk, readJson, parseLimit, parseOffset } from '@/lib/api';
import { getDevUser } from '@/lib/dev-auth';
import { sanitizeText, safeHttpUrl, escapeLikePattern } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';
import type { Hospital, ServiceType } from '@/types';

/**
 * Dev-portal hospital creation + moderation (worklist #36). Kept as its OWN
 * route rather than an authenticated-bypass branch inside the public
 * `POST /api/hospitals` — that route's threat model (unauthenticated, always
 * lands 'pending') stays exactly as it is; nothing here loosens it.
 *
 * Auth bar: ANY developer (primary or secondary), matching `/api/dev/tertiary`
 * and `/api/dev/first-aid` — creating/moderating hospital LISTINGS is routine
 * content moderation, the same class of action as those two routes, not the
 * higher primary-only bar `/api/dev/accounts` uses for internal admin-account
 * management or `/api/dev/doctor-consent` uses for third-party consent
 * liability. Documented here rather than silently picked.
 */

const SERVICE_TYPES: ServiceType[] = ['hospital', 'clinic', 'pharmacy', 'radiology', 'other'];
const STATUSES = ['pending', 'approved', 'rejected'] as const;
type HospitalStatus = (typeof STATUSES)[number];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET — list hospitals for dev review, any status (including pending, which
 * the public `/api/hospitals` never returns). Supports `?status=` (single
 * status or omitted for all) and `?q=` name search, paginated.
 */
export async function GET(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'), 50, 200);
  const offset = parseOffset(url.searchParams.get('offset'));
  const statusParam = url.searchParams.get('status');
  const q = url.searchParams.get('q');

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (statusParam && (STATUSES as readonly string[]).includes(statusParam)) {
    params.push(statusParam);
    conditions.push(`status = $${params.length}`);
  }
  if (q) {
    params.push(`%${escapeLikePattern(q)}%`);
    conditions.push(`name ILIKE $${params.length} ESCAPE '\\'`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [totalRow, { rows }] = await Promise.all([
    query<{ count: string }>(`SELECT count(*)::text AS count FROM hospitals ${where}`, params),
    query<Hospital>(
      `SELECT id, name, service_type, address, city, latitude, longitude, website,
              contact_phone, contact_email, logo_url, is_24_hour, is_private, verified,
              account_id, status, created_at, updated_at
       FROM hospitals ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ]);

  return apiOk({ hospitals: rows, total: Number(totalRow.rows[0]?.count ?? '0'), limit, offset });
}

interface CreateBody {
  name?: string;
  service_type?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  website?: string;
  contact_phone?: string;
  contact_email?: string;
  specialties?: string[];
  is_24_hour?: boolean;
  is_private?: boolean;
}

/**
 * POST — dev-direct hospital creation. Lands `status='approved'` immediately
 * (a developer is vouching for it on the institution's behalf — this is the
 * one legitimate reason to skip the public route's pending queue). Still
 * lands unverified (`account_id` NULL) — creating the listing and verifying
 * it (via /api/dev/tertiary, see that route's comment) are separate actions.
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<CreateBody>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const name = sanitizeText(body.name, 300)?.trim() ?? '';
  if (!name) return apiError('Hospital name is required.', 'MISSING_NAME', 400);

  const serviceType = SERVICE_TYPES.includes(body.service_type as ServiceType)
    ? (body.service_type as ServiceType)
    : 'hospital';

  const specialties = Array.isArray(body.specialties)
    ? body.specialties
        .filter((s): s is string => typeof s === 'string')
        .map((s) => sanitizeText(s, 200) ?? '')
        .filter(Boolean)
        .slice(0, 50)
    : [];

  const lat = typeof body.latitude === 'number' && Number.isFinite(body.latitude) ? body.latitude : null;
  const lng = typeof body.longitude === 'number' && Number.isFinite(body.longitude) ? body.longitude : null;

  const { rows } = await query<{ id: string }>(
    `INSERT INTO hospitals
       (name, service_type, address, city, latitude, longitude, website,
        contact_phone, contact_email, specialties, is_24_hour, is_private, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'approved')
     RETURNING id`,
    [
      name,
      serviceType,
      sanitizeText(body.address, 500),
      sanitizeText(body.city, 200),
      lat,
      lng,
      safeHttpUrl(body.website),
      sanitizeText(body.contact_phone, 100),
      sanitizeText(body.contact_email, 254),
      specialties,
      body.is_24_hour === true,
      body.is_private === true,
    ],
  );

  const id = rows[0]!.id;
  await logAudit({
    userId: dev.id,
    action: 'hospital_created_by_dev',
    resourceType: 'hospital',
    resourceId: id,
    details: { name, service_type: serviceType },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, id, status: 'approved' }, 201);
}

interface PatchBody {
  id?: string;
  action?: 'approve' | 'reject';
  /** Optional: link an existing hospital_staff account while approving, so a
   * single action can both approve the listing and grant verified status.
   * Must already belong to this exact hospital (created via
   * /api/dev/tertiary) — this never creates a new account itself. */
  account_id?: string;
}

/** PATCH — approve/reject a pending hospital. Any developer. Audit-logged. */
export async function PATCH(req: Request) {
  const dev = await getDevUser();
  if (!dev) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<PatchBody>(req);
  if (!body || !body.id || !UUID_RE.test(body.id) || (body.action !== 'approve' && body.action !== 'reject')) {
    return apiError('Invalid request.', 'BAD_REQUEST', 400);
  }

  const hospital = await queryOne<{ id: string; status: HospitalStatus }>(
    `SELECT id, status FROM hospitals WHERE id = $1`,
    [body.id],
  );
  if (!hospital) return apiError('Hospital not found.', 'NOT_FOUND', 404);
  if (hospital.status !== 'pending') {
    return apiError('Only a pending hospital can be approved or rejected.', 'NOT_PENDING', 400);
  }

  const newStatus: HospitalStatus = body.action === 'approve' ? 'approved' : 'rejected';

  let linkAccountId: string | null = null;
  if (body.action === 'approve' && body.account_id) {
    if (!UUID_RE.test(body.account_id)) return apiError('Invalid account_id.', 'BAD_REQUEST', 400);
    const staff = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND account_type = 'hospital_staff' AND hospital_id = $2`,
      [body.account_id, body.id],
    );
    if (!staff) {
      return apiError('account_id must be an existing tertiary account for this hospital.', 'BAD_REQUEST', 400);
    }
    linkAccountId = staff.id;
  }

  if (linkAccountId) {
    await query(`UPDATE hospitals SET status = $2, account_id = $3, verified = TRUE WHERE id = $1`, [
      body.id,
      newStatus,
      linkAccountId,
    ]);
  } else {
    await query(`UPDATE hospitals SET status = $2 WHERE id = $1`, [body.id, newStatus]);
  }

  await logAudit({
    userId: dev.id,
    action: body.action === 'approve' ? 'hospital_approved' : 'hospital_rejected',
    resourceType: 'hospital',
    resourceId: body.id,
    details: { linked_account_id: linkAccountId },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, status: newStatus });
}
