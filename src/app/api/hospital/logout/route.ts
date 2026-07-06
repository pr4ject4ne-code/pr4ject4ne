import { getHospitalStaff, destroyHospitalSession } from '@/lib/hospital-auth';
import { apiOk } from '@/lib/api';
import { logAudit, clientIpFrom } from '@/lib/audit';

export async function POST(req: Request) {
  const staff = await getHospitalStaff();
  await destroyHospitalSession();
  if (staff) {
    await logAudit({
      userId: staff.userId,
      action: 'logout',
      resourceType: 'hospital',
      resourceId: staff.hospitalId,
      ip: clientIpFrom(req.headers),
    });
  }
  return apiOk({ success: true });
}
