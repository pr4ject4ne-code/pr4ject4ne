import { NextResponse } from 'next/server';
import { listAnnouncements, createAnnouncement } from '@/lib/announcements';

export async function GET() {
  try {
    const rows = await listAnnouncements();
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, body: content, start_at, end_at, recurrence_rule } = body;
    if (!title || !content || !start_at || !end_at) {
      return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
    }
    // Basic server-side validation: ensure safe lengths
    if (typeof title !== 'string' || title.length > 300) return NextResponse.json({ error: 'invalid title' }, { status: 400 });
    if (typeof content !== 'string' || content.length > 10000) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

    const created = await createAnnouncement({ title, body: content, start_at, end_at, recurrence_rule: recurrence_rule ?? null });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}
