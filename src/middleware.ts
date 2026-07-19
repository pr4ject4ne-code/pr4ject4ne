import { NextResponse, type NextRequest } from 'next/server';

/**
 * Per-request nonce-based Content-Security-Policy (Next.js 15 pattern).
 *
 * A static `script-src 'self'` in next.config.mjs blocked Next's inline
 * bootstrap/hydration scripts, killing ALL client-side JS (P0). Instead, this
 * middleware mints a fresh nonce per request, sets the CSP on the response,
 * and forwards it on the request (`x-nonce` + the CSP header itself) so Next
 * stamps the same nonce onto every inline script it emits.
 *
 * Other security headers (HSTS, X-Frame-Options, etc.) stay in
 * next.config.mjs `headers()` — the CSP lives ONLY here. Route-level auth
 * (patient, hospital-staff, developer sessions) is enforced inside the
 * individual route handlers / lib guards, which have database access. Edge
 * middleware cannot query Postgres, so it stays lightweight.
 */

/**
 * Tightest policy compatible with the app: nonce'd scripts with
 * 'strict-dynamic', plus the map hosts the client needs — MapTiler
 * (api.maptiler.com: vector style, tiles, sprites, glyphs, geocoding), the
 * OpenStreetMap tile hosts (raster fallback), and the OSRM routing host.
 * MapLibre GL runs its renderer in a blob-URL worker, so `worker-src blob:` is
 * required. 'unsafe-inline' for styles is required by MapLibre + CSS modules.
 * This is the backstop for any URL sink that slips a bad value through (see
 * safeHttpUrl in lib/sanitize). 'unsafe-eval' is dev-only — Next's dev tooling
 * needs it; it must NEVER ship in production.
 *
 * The Supabase Storage host (where hospital/first-aid uploads live, see
 * lib/storage.ts) is derived from SUPABASE_URL rather than hardcoded — every
 * environment points at a different Supabase project ref, and a hardcoded ref
 * would silently block image rendering anywhere else (that's exactly what
 * happened here: uploads worked, but img-src had no Supabase host at all).
 */
function supabaseImgHost(): string | null {
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const supabaseHost = supabaseImgHost();
  const imgSrc = [
    "img-src 'self' data: blob: https://api.maptiler.com https://*.tile.openstreetmap.org https://unpkg.com",
    supabaseHost,
  ]
    .filter(Boolean)
    .join(' ');
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    imgSrc,
    "connect-src 'self' https://api.maptiler.com https://router.project-osrm.org https://*.tile.openstreetmap.org",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  // Forward the nonce and policy on the REQUEST so Next.js applies the nonce
  // to the inline scripts it renders (it reads the incoming CSP header), and
  // server components can read `x-nonce` via headers() if they ever need it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // And on the RESPONSE so the browser enforces it.
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Run on everything except Next internals and static assets, so every
  // HTML-serving route (pages) gets a nonce'd CSP.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
