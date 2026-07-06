import { getHospitalStaff } from '@/lib/hospital-auth';
import { queryOne } from '@/lib/db';
import { apiError, apiOk } from '@/lib/api';
import type { Hospital, Doctor, Announcement } from '@/types';

/**
 * Returns the staff member's own hospital with roster + announcements, for portal
 * hydration. Scoped strictly to the session's hospital_id (data isolation).
 */
export async function GET() {
  const staff = await getHospitalStaff();
  if (!staff) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const hospital = await queryOne<Hospital>(
    `SELECT * FROM hospitals WHERE id = $1`,
    [staff.hospitalId],
  );
  if (!hospital) return apiError('Hospital not found.', 'NOT_FOUND', 404);

  const doctors = await queryOne<{ list: Doctor[] }>(
    `SELECT coalesce(json_agg(d ORDER BY d.name), '[]') AS list
     FROM doctors d WHERE d.hospital_id = $1`,
    [staff.hospitalId],
  );
  const announcements = await queryOne<{ list: Announcement[] }>(
    `SELECT coalesce(json_agg(a ORDER BY a.created_at DESC), '[]') AS list
     FROM announcements a WHERE a.hospital_id = $1`,
    [staff.hospitalId],
  );

  return apiOk({
    hospital,
    doctors: doctors?.list ?? [],
    announcements: announcements?.list ?? [],
  });
}
