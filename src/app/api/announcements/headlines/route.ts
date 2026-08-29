import { NextResponse } from 'next/server';
import { getHeadlineAnnouncements } from '@/lib/announcements';

export async function GET() {
  try {
    const rows = await getHeadlineAnnouncements();
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}
