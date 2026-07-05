import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Liveness/health endpoint. Returns 200 when the process is up and the database
 * is reachable, 503 otherwise. Used for monitoring and CI smoke checks.
 */
export async function GET() {
  try {
    await query('SELECT 1');
    return NextResponse.json({ status: 'ok', db: 'ok' });
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'unreachable' }, { status: 503 });
  }
}
