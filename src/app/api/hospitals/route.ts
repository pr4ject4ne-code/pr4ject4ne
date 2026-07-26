import { query } from '@/lib/db';
import { apiError, apiOk, readJson, parseLimit, parseOffset } from '@/lib/api';
import { checkRateLimit } from '@/lib/auth';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { sanitizeText, safeHttpUrl } from '@/lib/sanitize';
import { buildHospitalFilters } from '@/lib/hospital-filters';
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
 * Query params: location, specialty, service_type, min_rating, open_24, q,
 * ownership (private|public), open_day (day name, e.g. "monday"),
 * lat + lng + radius_km (distance filter, all three required together),
 * symptom (comma-separated whitelisted symptom ids from the homepage's own
 * non-emergency, region-based vocabulary — worklist #8/#11, see
 * symptom-specialty-map.ts — ranks results by specialty-match strength,
 * then distance, then rating; callers must only send this after Stage 1's
 * red-flag gate, symptom-red-flags.ts, is clear),
 * limit, offset.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = parseOffset(url.searchParams.get('offset'));

  const symptomParam = url.searchParams.get('symptom');
  const symptoms = symptomParam
    ? symptomParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  const { conditions, params, orderBy } = buildHospitalFilters({
    location: url.searchParams.get('location'),
    specialty: url.searchParams.get('specialty'),
    serviceType: url.searchParams.get('service_type'),
    minRating: url.searchParams.get('min_rating'),
    open24: url.searchParams.get('open_24'),
    q: url.searchParams.get('q'),
    ownership: url.searchParams.get('ownership'),
    openDay: url.searchParams.get('open_day'),
    lat: url.searchParams.get('lat'),
    lng: url.searchParams.get('lng'),
    radiusKm: url.searchParams.get('radius_km'),
    symptoms,
  });

  const where = `WHERE ${conditions.join(' AND ')}`;
  // A symptom search ranks by specialty-match strength (then distance, then
  // rating) instead of the default verified-first ordering — scoped to
  // specialty+distance+rating for v1 (no price/booking-availability data
  // exists in the schema; see WORKLIST.md #8).
  const orderClause = orderBy ?? 'verified DESC, rating_avg DESC, name ASC';

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
              rating_avg, rating_count, is_24_hour, show_doctors, is_private, verified, account_id,
              status, created_at, updated_at
       FROM hospitals ${where}
       ORDER BY ${orderClause}
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
