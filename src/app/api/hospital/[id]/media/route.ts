import { query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { requireHospitalOwnership } from '@/lib/hospital-auth';
import { sanitizeText, safeHttpUrl } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';
import type { HospitalPhoto } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOTS = ['outside_far', 'outside_close', 'reception', 'other'];

interface Body {
  photos?: HospitalPhoto[];
  logo_url?: string | null;
}

/**
 * PUT — replace the hospital's photo set (own hospital only). Max 5 photos.
 * TODO: image storage deferred — accepts URLs (local FS in dev). When S3/server
 * storage is wired, validate file type (jpeg/png/webp) and size (<=5MB) here.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!UUID_RE.test((await params).id)) return apiError('Not found.', 'NOT_FOUND', 404);
  const staff = await requireHospitalOwnership((await params).id);
  if (!staff) return apiError('Forbidden.', 'FORBIDDEN', 403);

  const body = await readJson<Body>(req);
  if (!body) return apiError('Invalid request body.', 'BAD_REQUEST', 400);

  // Only keep photos whose URL is a valid http(s) URL — blocks javascript:/data:
  // URLs from ever reaching an <img src>/<a href> sink.
  const photos: HospitalPhoto[] = Array.isArray(body.photos)
    ? body.photos
        .map((p) => ({ p, url: p && safeHttpUrl(p.url) }))
        .filter((x): x is { p: HospitalPhoto; url: string } => Boolean(x.url))
        .slice(0, 5)
        .map(({ p, url }) => ({
          url,
          caption: sanitizeText(p.caption, 200) ?? undefined,
          slot: SLOTS.includes(p.slot ?? '') ? p.slot : 'other',
        }))
    : [];

  // Distinguish three cases for the logo:
  //   key absent            -> leave logo_url untouched
  //   key present, null/'' -> clear it (set NULL)
  //   key present, string   -> set the safe URL (invalid scheme also clears)
  const clearLogo = 'logo_url' in body && !body.logo_url;
  const newLogo =
    typeof body.logo_url === 'string' && body.logo_url ? safeHttpUrl(body.logo_url) ?? null : null;

  if ('logo_url' in body) {
    await query(
      `UPDATE hospitals SET photos = $2::jsonb, logo_url = $3, updated_at = now() WHERE id = $1`,
      [(await params).id, JSON.stringify(photos), clearLogo ? null : newLogo],
    );
  } else {
    await query(
      `UPDATE hospitals SET photos = $2::jsonb, updated_at = now() WHERE id = $1`,
      [(await params).id, JSON.stringify(photos)],
    );
  }

  await logAudit({
    userId: staff.userId,
    action: 'hospital_update',
    resourceType: 'hospital',
    resourceId: (await params).id,
    details: { field: 'media', photo_count: photos.length },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, photos });
}
