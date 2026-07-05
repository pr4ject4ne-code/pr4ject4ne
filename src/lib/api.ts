import { NextResponse } from 'next/server';

/** Consistent JSON error response: { error, code }. */
export function apiError(message: string, code: string, status: number): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

export function apiOk<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

/** Parse a JSON body, returning null (not throwing) on malformed input. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Clamp a pagination limit to a sane range. */
export function parseLimit(raw: string | null, fallback = 20, max = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function parseOffset(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
