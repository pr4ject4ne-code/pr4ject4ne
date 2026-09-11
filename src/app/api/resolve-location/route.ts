import { apiError, apiOk, readJson } from '@/lib/api';
import { getDevUser } from '@/lib/dev-auth';
import { getHospitalStaff } from '@/lib/hospital-auth';
import { checkRateLimit } from '@/lib/auth';
import { geocode, parseGoogleMapsUrl } from '@/lib/map';

/**
 * POST /api/resolve-location — item 5: turn a pasted Google Maps link or
 * plain address into coordinates, so whoever is setting a hospital's
 * location (a Racoon Eye dev creating one, or hospital staff editing their
 * own) doesn't have to hunt down latitude/longitude by hand.
 *
 * Three input shapes, tried in order:
 *  1. A full Google Maps URL with coordinates already embedded in the text
 *     (`@lat,lng`, `!3d!4d`, `?q=lat,lng`) — resolved with zero network calls
 *     via parseGoogleMapsUrl, and the most exact of the three.
 *  2. A SHORTENED Google Maps link (maps.app.goo.gl, goo.gl/maps) — these
 *     don't carry coordinates in the URL text at all; the coordinates only
 *     appear after following the redirect. A browser fetch() can't read a
 *     cross-origin redirect's target for a no-cors request, so this has to
 *     happen server-side.
 *  3. Plain text (an address, area, or landmark) — forwarded to the existing
 *     geocode() (MapTiler, already used for symptom-search "nearest").
 *
 * Authenticated dev OR hospital staff only (not public) — this proxies a
 * paid geocoding API and follows arbitrary user-supplied URLs server-side,
 * so it needs a real identity behind it and a rate limit, same reasoning as
 * any other outbound-fetch endpoint in this app.
 */
export async function POST(req: Request) {
  const dev = await getDevUser();
  const staff = dev ? null : await getHospitalStaff();
  if (!dev && !staff) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const identityKey = dev ? `dev:${dev.id}` : `staff:${staff!.userId}`;
  const allowed = await checkRateLimit(`resolve_location:${identityKey}`, 30, 3600);
  if (!allowed) return apiError('Too many requests. Please try again later.', 'RATE_LIMITED', 429);

  const body = await readJson<{ input?: string }>(req);
  const input = body?.input?.trim();
  if (!input) return apiError('input is required.', 'BAD_REQUEST', 400);
  if (input.length > 2000) return apiError('That input is too long.', 'BAD_REQUEST', 400);

  // 1. Coordinates already embedded in the URL text.
  const embedded = parseGoogleMapsUrl(input);
  if (embedded) return apiOk({ ...embedded, source: 'url' });

  // 2. A shortened Google Maps link — follow the redirect server-side, then
  // re-parse the FINAL url. Only ever fetches maps.google.* / goo.gl hosts
  // (checked before the request, not just after) to keep this from being an
  // open server-side-fetch proxy for arbitrary URLs.
  if (/^https?:\/\//i.test(input)) {
    let host: string;
    try {
      host = new URL(input).hostname;
    } catch {
      return apiError('That does not look like a valid URL.', 'BAD_REQUEST', 400);
    }
    const isGoogleMapsHost = /(^|\.)google\.[a-z.]+$/i.test(host) || /(^|\.)goo\.gl$/i.test(host);
    if (!isGoogleMapsHost) {
      return apiError('Only Google Maps links are supported — paste the link, or type a plain address instead.', 'UNSUPPORTED_HOST', 422);
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(input, { redirect: 'follow', signal: controller.signal });
      clearTimeout(timer);
      const finalUrl = res.url;
      const resolved = parseGoogleMapsUrl(finalUrl);
      if (resolved) return apiOk({ ...resolved, source: 'url_redirect' });
    } catch {
      // fall through to the "could not resolve" error below
    }
    return apiError("Couldn't read coordinates from that link. Try pasting the full (non-shortened) Google Maps URL, or type the address instead.", 'UNRESOLVED', 422);
  }

  // 3. Plain text — geocode it.
  const geocoded = await geocode(input);
  if (!geocoded) return apiError("Couldn't find that address. Try a more specific address, or paste a Google Maps link instead.", 'UNRESOLVED', 422);
  return apiOk({ ...geocoded, source: 'geocode' });
}
