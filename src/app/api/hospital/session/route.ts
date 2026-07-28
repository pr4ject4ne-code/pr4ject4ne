import { getHospitalStaffUser } from '@/lib/hospital-auth';
import { queryOne } from '@/lib/db';
import { apiError, apiOk } from '@/lib/api';
import type { Hospital, Doctor, Announcement } from '@/types';

/**
 * Returns the staff member's own hospital with roster + announcements, for portal
 * hydration. Scoped strictly to the session's hospital_id (data isolation).
 */
export async function GET() {
  const staffUser = await getHospitalStaffUser();
  if (!staffUser || !staffUser.hospital_id) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const hospital = await queryOne<Hospital>(
    `SELECT * FROM hospitals WHERE id = $1`,
    [staffUser.hospital_id],
  );
  if (!hospital) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  // Roster and announcements are independent — fetch them in parallel.
  const [doctors, announcements] = await Promise.all([
    queryOne<{ list: Doctor[] }>(
      `SELECT coalesce(json_agg(d ORDER BY d.name), '[]') AS list
       FROM doctors d WHERE d.hospital_id = $1`,
      [staffUser.hospital_id],
    ),
    queryOne<{ list: Announcement[] }>(
      `SELECT coalesce(json_agg(a ORDER BY a.created_at DESC), '[]') AS list
       FROM announcements a WHERE a.hospital_id = $1`,
      [staffUser.hospital_id],
    ),
  ]);

  return apiOk({
    hospital,
    doctors: doctors?.list ?? [],
    announcements: announcements?.list ?? [],
    // Which account is signed in — surfaced in HospitalShell's header so it's
    // never ambiguous who is authenticated in the portal.
    staff_email: staffUser.email,
  });
}
