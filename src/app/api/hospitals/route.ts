import { query } from '@/lib/db';
import { apiError, apiOk, readJson, parseLimit, parseOffset } from '@/lib/api';
import { checkRateLimit } from '@/lib/auth';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { sanitizeText, safeHttpUrl, escapeLikePattern } from '@/lib/sanitize';
import type { Hospital, ServiceType } from '@/types';

const SERVICE_TYPES: ServiceType[] = ['hospital', 'clinic', 'pharmacy', 'radiology', 'other'];

/**
 * Cap for the directory COUNT(*): this endpoint is public and unauthenticated,
 * so an unbounded count over an arbitrary filter is a cheap DoS lever. Counting
 * stops at the cap; pagination stays exact below it (offset + page < total ⇒
 * more rows exist).
 */
const COUNT_CAP = 500;

/**
 * GET /api/hospitals — paginated, filterable directory (public).
 * Query params: location, specialty, service_type, min_rating, open_24, q, limit, offset.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = parseOffset(url.searchParams.get('offset'));

  const conditions: string[] = [`status = 'approved'`];
  const params: unknown[] = [];

  const location = url.searchParams.get('location');
  if (location) {
    params.push(`%${escapeLikePattern(location)}%`);
    conditions.push(
      `(city ILIKE $${params.length} ESCAPE '\\' OR address ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  const specialty = url.searchParams.get('specialty');
  if (specialty) {
    params.push(specialty);
    conditions.push(`$${params.length} = ANY (specialties)`);
  }

  const serviceType = url.searchParams.get('service_type');
  if (serviceType && SERVICE_TYPES.includes(serviceType as ServiceType)) {
    params.push(serviceType);
    conditions.push(`service_type = $${params.length}`);
  }

  const minRating = url.searchParams.get('min_rating');
  if (minRating && Number.isFinite(Number(minRating))) {
    // Clamp to the valid rating range so out-of-range values can't silently
    // become no-op or nonsensical filters.
    const clamped = Math.min(5, Math.max(0, Number(minRating)));
    params.push(clamped);
    conditions.push(`rating_avg >= $${params.length}`);
  }

  if (url.searchParams.get('open_24') === 'true') {
    conditions.push('is_24_hour = TRUE');
  }

  const q = url.searchParams.get('q');
  if (q) {
    params.push(`%${escapeLikePattern(q)}%`);
    conditions.push(`name ILIKE $${params.length} ESCAPE '\\'`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  // Count and page fetch are independent — run them in parallel. The count is
  // bounded by COUNT_CAP (see above) via a LIMITed subquery.
  const [totalRow, { rows }] = await Promise.all([
    query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM (SELECT 1 FROM hospitals ${where} LIMIT ${COUNT_CAP}) t`,
      params,
    ),
    query<Hospital>(
      `SELECT id, name, service_type, address, city, latitude, longitude, website,
              contact_phone, contact_email, logo_url, photos, hours, specialties, departments,
              rating_avg, rating_count, is_24_hour, show_doctors, verified, account_id, status,
              created_at, updated_at
       FROM hospitals ${where}
       ORDER BY verified DESC, rating_avg DESC, name ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ]);
  const total = Number(totalRow.rows[0]?.count ?? '0');

  return apiOk({ hospitals: rows, total, limit, offset });
}

interface RegisterBody {
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
}

/**
 * POST /api/hospitals — register a hospital listing. Lands in 'pending' status
 * until moderated. account_id is left NULL (community-managed) at this stage;
 * institution accounts are linked via the partner-registration flow.
 */
export async function POST(req: Request) {
  // Unauthenticated public endpoint — rate-limit by IP to stop moderation-queue
  // flooding and storage abuse (mirrors the suggestion/feedback endpoints).
  const ip = clientIpFrom(req.headers);
  const allowed = await checkRateLimit(`hospital_register:${ip ?? 'unknown'}`, 5, 3600);
  if (!allowed) return apiError('Too many registrations. Try again later.', 'RATE_LIMITED', 429);

  const body = await readJson<RegisterBody>(req);
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

  const { rows } = await query<{ id: string }>(
    `INSERT INTO hospitals
       (name, service_type, address, city, latitude, longitude, website,
        contact_phone, contact_email, specialties, is_24_hour, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
     RETURNING id`,
    [
      name,
      serviceType,
      sanitizeText(body.address, 500),
      sanitizeText(body.city, 200),
      typeof body.latitude === 'number' ? body.latitude : null,
      typeof body.longitude === 'number' ? body.longitude : null,
      safeHttpUrl(body.website),
      sanitizeText(body.contact_phone, 100),
      sanitizeText(body.contact_email, 254),
      specialties,
      body.is_24_hour === true,
    ],
  );

  const id = rows[0]!.id;
  await logAudit({
    action: 'hospital_register',
    resourceType: 'hospital',
    resourceId: id,
    details: { name, service_type: serviceType },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, id, status: 'pending' }, 201);
}
