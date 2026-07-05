import { getDevSession, destroyDevSession } from '@/lib/dev-auth';
import { apiOk } from '@/lib/api';
import { logAudit, clientIpFrom } from '@/lib/audit';

export async function POST(req: Request) {
  const session = await getDevSession();
  await destroyDevSession();
  if (session) {
    await logAudit({
      userId: session.user_id,
      action: 'logout',
      resourceType: 'dev',
      ip: clientIpFrom(req.headers),
    });
  }
  return apiOk({ success: true });
}
