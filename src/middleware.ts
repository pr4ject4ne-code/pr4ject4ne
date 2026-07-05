import { NextResponse, type NextRequest } from 'next/server';

/**
 * Session/auth middleware skeleton.
 *
 * Phase 0: only attaches baseline security headers. Route-level auth (patient,
 * hospital-staff, developer sessions) is enforced inside the individual route
 * handlers / lib guards, which have access to the database. Edge middleware
 * cannot query Postgres, so it stays lightweight here.
 */
export function middleware(_request: NextRequest): NextResponse {
  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
