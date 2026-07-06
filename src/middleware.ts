import { NextResponse, type NextRequest } from 'next/server';

/**
 * Session/auth middleware skeleton.
 *
 * This is intentionally a pass-through. Security headers (CSP, HSTS, X-Frame,
 * etc.) are set centrally in next.config.mjs `headers()`, NOT here. Route-level
 * auth (patient, hospital-staff, developer sessions) is enforced inside the
 * individual route handlers / lib guards, which have database access. Edge
 * middleware cannot query Postgres, so it stays lightweight.
 */
export function middleware(_request: NextRequest): NextResponse {
  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
