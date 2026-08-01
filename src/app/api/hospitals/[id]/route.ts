import { cookies } from 'next/headers';
import { queryOne, query } from '@/lib/db';
import { apiError, apiOk } from '@/lib/api';
import { getPatientSession } from '@/lib/auth';
import { fetchDepartmentAggregates, fetchPatientDepartmentRatings } from '@/lib/department-ratings';
import type { Hospital, Doctor, Announcement } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/hospitals/[id] — full public hospital profile with roster,
 * announcements, and per-department rating aggregates.
 *
 * Session-reading is OPTIONAL here (mirrors the anonymous-friendly pattern in
 * authorizeRead, src/app/api/biodata/[userId]/route.ts) — this route MUST
 * stay public/unauthenticated for everyone else. `your_ratings` is only
 * attached when a valid patient session cookie is present (`session?.user_id`,
 * never `??`, so a missing session can never be mistaken for a real caller);
 * it is omitted entirely for signed-out visitors.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return apiError('Hospital not found.', 'NOT_FOUND', 404);
  }

  // Hospital first so a 404 short-circuits without touching the child tables.
  const hospital = await queryOne<Hospital>(
    `SELECT id, name, service_type, address, city, latitude, longitude, website,
            contact_phone, contact_email, logo_url, photos, hours, specialties, departments,
            rating_avg, rating_count, is_24_hour, show_doctors, is_private, verified, account_id,
            status, created_at, updated_at
     FROM hospitals WHERE id = $1 AND status = 'approved'`,
    [id],
  );
  if (!hospital) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);

  // Roster, announcements, and department rating aggregates are all
  // independent — fetch them in parallel. The caller's own per-department
  // ratings are fetched alongside only when a session is present.
  const [doctors, announcements, departmentRatings, yourRatings] = await Promise.all([
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
    fetchDepartmentAggregates(id),
    session?.user_id ? fetchPatientDepartmentRatings(id, session.user_id) : Promise.resolve(undefined),
  ]);

  return apiOk({
    hospital,
    doctors: doctors.rows,
    announcements: announcements.rows,
    department_ratings: departmentRatings,
    your_ratings: yourRatings,
  });
}
