import { NextResponse } from 'next/server';
import { insertAnnouncementAudit, searchAnnouncementLogs } from '@/lib/announcements';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { announcement_id, action, details } = body;
    if (!announcement_id || !action) {
      return NextResponse.json({ error: 'announcement_id and action required' }, { status: 400 });
    }
    // Try to get actor info from headers (best-effort)
    const actorIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;
    const actorId = body.actor_id ?? null;
    const userAgent = req.headers.get('user-agent') ?? null;

    const row = await insertAnnouncementAudit({ announcement_id, action, actor_id: actorId, actor_ip: actorIp, details: { ...(details ?? {}), userAgent } });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q');
    const actor = url.searchParams.get('actor');
    const action = url.searchParams.get('action');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const announcement_id = url.searchParams.get('announcement_id');
    const page = url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!, 10) : 1;
    const pageSize = url.searchParams.get('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : 50;

    const rows = await searchAnnouncementLogs({ q, actor, action, from, to, announcement_id, page, pageSize });
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}
