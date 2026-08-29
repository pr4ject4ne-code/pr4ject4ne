import { NextResponse } from 'next/server';
import { getAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/lib/announcements';

export async function GET(req: Request, { params }: any) {
  try {
    const { id } = params;
    const row = await getAnnouncement(id);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: any) {
  try {
    const { id } = params;
    const body = await req.json();
    // Accept partial updates
    const allowed: Record<string, boolean> = {
      title: true,
      body: true,
      start_at: true,
      end_at: true,
      recurrence_rule: true,
    };
    const updates: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (allowed[key]) updates[key] = body[key];
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'no updatable fields' }, { status: 400 });
    const updated = await updateAnnouncement(id, updates as any);
    return NextResponse.json(updated);
  } catch (err) {
    // updateAnnouncement throws for not found or if modification not allowed
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: any) {
  try {
    const { id } = params;
    await deleteAnnouncement(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 400 });
  }
}
