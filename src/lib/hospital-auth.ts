import { cookies } from 'next/headers';
import {
  getSession,
  destroySession,
  findUserById,
  HOSPITAL_SESSION_COOKIE,
} from '@/lib/auth';
import type { User } from '@/types';

/**
 * Hospital-staff session helpers — a SEPARATE session from patient/dev auth,
 * stored in its own cookie. Hospital staff accounts live in the users table with
 * account_type = 'hospital_staff' and a non-null hospital_id.
 *
 * DATA ISOLATION: every hospital-portal query MUST be scoped to the staff
 * member's own hospital_id (returned by requireHospitalStaff). Staff for
 * hospital A can never read or write hospital B's data.
 */

export { HOSPITAL_SESSION_COOKIE };

export interface HospitalStaff {
  userId: string;
  hospitalId: string;
}

export async function getHospitalStaff(): Promise<HospitalStaff | null> {
  const token = (await cookies()).get(HOSPITAL_SESSION_COOKIE)?.value;
  const session = await getSession(token);
  if (!session || session.account_type !== 'hospital_staff') return null;

  const user = await findUserById(session.user_id);
  if (!user || user.account_type !== 'hospital_staff' || !user.is_active || !user.hospital_id) {
    return null;
  }
  return { userId: user.id, hospitalId: user.hospital_id };
}

export async function getHospitalStaffUser(): Promise<User | null> {
  const staff = await getHospitalStaff();
  if (!staff) return null;
  return findUserById(staff.userId);
}

export async function destroyHospitalSession(): Promise<void> {
  const token = (await cookies()).get(HOSPITAL_SESSION_COOKIE)?.value;
  await destroySession(token);
  (await cookies()).delete(HOSPITAL_SESSION_COOKIE);
}

/**
 * Guard: confirm the requesting staff owns the given hospitalId. Returns the
 * staff context on success, or null (caller returns 403). This is the single
 * choke point that enforces cross-hospital isolation.
 */
export async function requireHospitalOwnership(
  hospitalId: string,
): Promise<HospitalStaff | null> {
  const staff = await getHospitalStaff();
  if (!staff || staff.hospitalId !== hospitalId) return null;
  return staff;
}
