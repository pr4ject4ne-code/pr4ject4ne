import { apiError, apiOk, readJson } from '@/lib/api';
import { requireHospitalOwnership } from '@/lib/hospital-auth';
import { logAudit, clientIpFrom } from '@/lib/audit';
import {
  listHospitalAnnouncements,
  createHospitalAnnouncement,
  updateHospitalAnnouncement,
  deleteHospitalAnnouncement,
  type CreateHospitalAnnouncementInput,
} from '@/lib/hospital-announcements';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET — list a hospital's own announcements (own hospital only), chronological. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership(id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const rows = await listHospitalAnnouncements(id);
  return apiOk(rows);
}

interface CreateBody extends CreateHospitalAnnouncementInput {}

/** POST — create an announcement (own hospital only). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership(id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<CreateBody>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  let created;
  try {
    created = await createHospitalAnnouncement(id, body);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Could not create announcement.', 'INVALID_ANNOUNCEMENT', 400);
  }

  await logAudit({
    userId: staff.userId,
    action: 'announcement_change',
    resourceType: 'hospital_announcement',
    resourceId: created.id,
    details: { op: 'create', color: created.color, is_bar: created.is_bar, recurrence_freq: created.recurrence_freq },
    ip: clientIpFrom(req.headers),
  });

  return apiOk(created, 201);
}

interface PatchBody extends Partial<CreateHospitalAnnouncementInput> {
  id?: string;
}

/** PATCH — edit an announcement (own hospital only). Blocked once the date has passed. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership(id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<PatchBody>(req);
  if (!body || !body.id || !UUID_RE.test(body.id)) return apiError('Invalid request.', 'BAD_REQUEST', 400);

  let updated;
  try {
    updated = await updateHospitalAnnouncement(id, body.id, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not update announcement.';
    if (msg === 'NOT_FOUND') return apiError('Not found.', 'NOT_FOUND', 404);
    return apiError(msg, 'ANNOUNCEMENT_LOCKED', 400);
  }

  await logAudit({
    userId: staff.userId,
    action: 'announcement_change',
    resourceType: 'hospital_announcement',
    resourceId: body.id,
    details: { op: 'edit' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk(updated);
}

/** DELETE — remove an announcement (own hospital only). Blocked within 3 days of its date. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership(id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const annId = new URL(req.url).searchParams.get('announcement_id');
  if (!annId || !UUID_RE.test(annId)) return apiError('Invalid request.', 'BAD_REQUEST', 400);

  try {
    await deleteHospitalAnnouncement(id, annId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not delete announcement.';
    if (msg === 'NOT_FOUND') return apiError('Not found.', 'NOT_FOUND', 404);
    return apiError(msg, 'ANNOUNCEMENT_LOCKED', 400);
  }

  await logAudit({
    userId: staff.userId,
    action: 'announcement_change',
    resourceType: 'hospital_announcement',
    resourceId: annId,
    details: { op: 'delete' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true });
}
