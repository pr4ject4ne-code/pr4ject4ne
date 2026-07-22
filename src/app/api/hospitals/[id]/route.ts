import { queryOne, query } from '@/lib/db';
import { apiError, apiOk } from '@/lib/api';
import type { Hospital, Doctor, Announcement } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/hospitals/[id] — full public hospital profile with roster + announcements. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return apiError('Hospital not found.', 'NOT_FOUND', 404);
  }

  // Hospital first so a 404 short-circuits without touching the child tables.
  const hospital = await queryOne<Hospital>(
    `SELECT id, name, service_type, address, city, latitude, longitude, website,
            contact_phone, contact_email, logo_url, photos, hours, specialties,
            rating_avg, rating_count, is_24_hour, show_doctors, verified, account_id, status,
            created_at, updated_at
     FROM hospitals WHERE id = $1 AND status = 'approved'`,
    [id],
  );
  if (!hospital) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  // Roster and announcements are independent — fetch them in parallel.
  const [doctors, announcements] = await Promise.all([
    query<Doctor>(
      `SELECT id, hospital_id, name, specialty, level, rating_avg, rating_count,
              created_at, updated_at
       FROM doctors WHERE hospital_id = $1 ORDER BY name ASC`,
      [id],
    ),
    query<Announcement>(
      `SELECT id, hospital_id, title, body, color, event_date, is_bar,
              created_at, updated_at
       FROM announcements WHERE hospital_id = $1
       ORDER BY event_date DESC NULLS LAST, created_at DESC`,
      [id],
    ),
  ]);

  return apiOk({
    hospital,
    doctors: doctors.rows,
    announcements: announcements.rows,
  });
}
