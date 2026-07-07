import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { requireHospitalOwnership } from '@/lib/hospital-auth';
import { sanitizeText } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEVELS = ['consultant', 'senior_registrar', 'registrar', 'intern', 'other'];

interface CreateBody {
  name?: string;
  specialty?: string;
  level?: string;
}

/** POST — add a doctor (own hospital only). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!UUID_RE.test((await params).id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership((await params).id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<CreateBody>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  const name = sanitizeText(body.name, 200);
  if (!name || !name.trim()) return apiError('Name is required.', 'MISSING_NAME', 400);
  const specialty = sanitizeText(body.specialty, 120);
  const level = LEVELS.includes(body.level ?? '') ? body.level : null;

  const { rows } = await query<{ id: string }>(
    `INSERT INTO doctors (hospital_id, name, specialty, level)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [(await params).id, name, specialty, level],
  );

  await logAudit({
    userId: staff.userId,
    action: 'personnel_change',
    resourceType: 'doctor',
    resourceId: rows[0]!.id,
    details: { op: 'add', name },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, id: rows[0]!.id }, 201);
}

interface PatchBody extends CreateBody {
  id?: string;
}

/** PATCH — edit a doctor (own hospital only). Ratings are read-only, never set here. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!UUID_RE.test((await params).id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership((await params).id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<PatchBody>(req);
  if (!body || !body.id || !UUID_RE.test(body.id)) return apiError('Invalid request.', 'BAD_REQUEST', 400);

  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };
  if (typeof body.name === 'string') {
    const n = sanitizeText(body.name, 200);
    if (n && n.trim()) push('name', n);
  }
  if ('specialty' in body) push('specialty', sanitizeText(body.specialty, 120));
  if ('level' in body) push('level', LEVELS.includes(body.level ?? '') ? body.level : null);

  if (sets.length === 0) return apiError('Nothing to update.', 'BAD_REQUEST', 400);

  values.push(body.id, (await params).id);
  const { rowCount } = await query(
    `UPDATE doctors SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${values.length - 1} AND hospital_id = $${values.length}`,
    values,
  );
  if (!rowCount) return apiError('Not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId: staff.userId,
    action: 'personnel_change',
    resourceType: 'doctor',
    resourceId: body.id,
    details: { op: 'edit' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}

/** DELETE — remove a doctor (own hospital only). Pass ?doctor_id=. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!UUID_RE.test((await params).id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership((await params).id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const doctorId = new URL(req.url).searchParams.get('doctor_id');
  if (!doctorId || !UUID_RE.test(doctorId)) return apiError('Invalid request.', 'BAD_REQUEST', 400);

  const { rowCount } = await query(
    `DELETE FROM doctors WHERE id = $1 AND hospital_id = $2`,
    [doctorId, (await params).id],
  );
  if (!rowCount) return apiError('Not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId: staff.userId,
    action: 'personnel_change',
    resourceType: 'doctor',
    resourceId: doctorId,
    details: { op: 'remove' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}
