import { cookies } from 'next/headers';
import { destroySession, getSession, SESSION_COOKIE } from '@/lib/auth';
import { apiOk } from '@/lib/api';
import { logAudit, clientIpFrom } from '@/lib/audit';

export async function POST(req: Request) {
  const store = cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const session = await getSession(token);
  await destroySession(token);
  store.delete(SESSION_COOKIE);
  if (session) {
    await logAudit({ userId: session.user_id, action: 'logout', ip: clientIpFrom(req.headers) });
  }
  return apiOk({ success: true });
}
