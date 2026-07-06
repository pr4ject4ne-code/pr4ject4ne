import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { requireHospitalOwnership } from '@/lib/hospital-auth';
import { logAudit, clientIpFrom } from '@/lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface Body {
  hours?: Record<string, string>;
}

/** PATCH — set operating hours (own hospital only). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership(params.id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<Body>(req);
  if (!body || typeof body.hours !== 'object' || body.hours === null) {
    return apiError('Hours object required.', 'BAD_REQUEST', 400);
  }

  // Keep only known day keys with short string values.
  const clean: Record<string, string> = {};
  for (const day of DAYS) {
    const v = body.hours[day];
    if (typeof v === 'string' && v.length <= 100) clean[day] = v;
  }

  await query(
    `UPDATE hospitals SET hours = $2::jsonb, updated_at = now() WHERE id = $1`,
    [params.id, JSON.stringify(clean)],
  );

  await logAudit({
    userId: staff.userId,
    action: 'hospital_update',
    resourceType: 'hospital',
    resourceId: params.id,
    details: { field: 'hours' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, hours: clean });
}
