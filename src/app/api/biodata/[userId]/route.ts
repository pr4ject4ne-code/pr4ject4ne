import { cookies } from 'next/headers';
import { queryOne, query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getPatientSession, checkRateLimit, constantTimeEquals } from '@/lib/auth';
import { sanitizeLayer } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { isValidIhnCode } from '@/lib/ihn-code';
import type { Biodata, BiodataLayer, ProfileLayer } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Biodata access is gated by BOTH:
 *  1. A valid patient session (cookie), AND
 *  2. The correct IHN code (X-IHN-Code header) for the target row.
 *
 * A user may only ever read/write their OWN biodata (session.user_id must equal
 * the path userId) — row-level isolation. The IHN code is the second factor that
 * unlocks the sensitive biodata layer, exactly as the emergency-access design
 * intends.
 */

interface Authorized {
  userId: string;
  record: Biodata;
}

async function authorize(
  paramUserId: string,
  headers: Headers,
): Promise<{ ok: true; data: Authorized } | { ok: false; response: ReturnType<typeof apiError> }> {
  if (!UUID_RE.test(paramUserId)) {
    return { ok: false, response: apiError('Not found.', 'NOT_FOUND', 404) };
  }

  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);
  if (!session) {
    return { ok: false, response: apiError('Not authenticated.', 'UNAUTHENTICATED', 401) };
  }
  if (session.user_id !== paramUserId) {
    return { ok: false, response: apiError('Forbidden.', 'FORBIDDEN', 403) };
  }

  // Rate-limit biodata access attempts: max 10 / minute per user.
  const allowed = await checkRateLimit(`biodata:${session.user_id}`, 10, 60);
  if (!allowed) {
    return { ok: false, response: apiError('Too many attempts.', 'RATE_LIMITED', 429) };
  }

  const ihnHeader = headers.get('x-ihn-code')?.trim() ?? '';
  if (!isValidIhnCode(ihnHeader)) {
    return { ok: false, response: apiError('IHN code required.', 'IHN_REQUIRED', 401) };
  }

  const record = await queryOne<Biodata>(
    `SELECT user_id, profile_layer, biodata_layer, ihn_code, last_modified_at, created_at
     FROM biodata WHERE user_id = $1`,
    [paramUserId],
  );
  if (!record) {
    return { ok: false, response: apiError('Not found.', 'NOT_FOUND', 404) };
  }
  if (!constantTimeEquals(record.ihn_code, ihnHeader)) {
    await logAudit({
      userId: session.user_id,
      action: 'biodata_read',
      resourceType: 'biodata',
      resourceId: paramUserId,
      details: { result: 'ihn_mismatch' },
      ip: clientIpFrom(headers),
    });
    return { ok: false, response: apiError('Invalid IHN code.', 'IHN_INVALID', 401) };
  }

  return { ok: true, data: { userId: session.user_id, record } };
}

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await authorize((await params).userId, req.headers);
  if (!auth.ok) return auth.response;

  await logAudit({
    userId: auth.data.userId,
    action: 'biodata_read',
    resourceType: 'biodata',
    resourceId: (await params).userId,
    details: { via: 'ihn_code' },
    ip: clientIpFrom(req.headers),
  });

  const { record } = auth.data;
  return apiOk({
    user_id: record.user_id,
    profile_layer: record.profile_layer,
    biodata_layer: record.biodata_layer,
    ihn_code: record.ihn_code,
    last_modified_at: record.last_modified_at,
  });
}

interface PatchBody {
  profile_layer?: ProfileLayer;
  biodata_layer?: BiodataLayer;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await authorize((await params).userId, req.headers);
  if (!auth.ok) return auth.response;

  const body = await readJson<PatchBody>(req);
  if (!body || (!body.profile_layer && !body.biodata_layer)) {
    return apiError('Nothing to update.', 'BAD_REQUEST', 400);
  }

  const { record, userId } = auth.data;

  // Reject non-object layers and sanitize/cap each supplied layer before merging.
  const profilePatch = body.profile_layer === undefined ? {} : sanitizeLayer(body.profile_layer);
  const biodataPatch = body.biodata_layer === undefined ? {} : sanitizeLayer(body.biodata_layer);
  if (profilePatch === null || biodataPatch === null) {
    return apiError('profile_layer and biodata_layer must be objects.', 'BAD_REQUEST', 400);
  }

  // Merge onto existing layers so partial updates don't wipe fields.
  const nextProfile: ProfileLayer = { ...record.profile_layer, ...(profilePatch as Partial<ProfileLayer>) };
  const nextBiodata: BiodataLayer = { ...record.biodata_layer, ...(biodataPatch as Partial<BiodataLayer>) };

  // BMI is always derived, never client-authoritative.
  if (typeof nextBiodata.height_cm === 'number' && typeof nextBiodata.weight_kg === 'number') {
    const h = nextBiodata.height_cm / 100;
    if (h > 0) {
      nextBiodata.bmi = Math.round((nextBiodata.weight_kg / (h * h)) * 10) / 10;
    }
  }

  await query(
    `UPDATE biodata
     SET profile_layer = $2::jsonb, biodata_layer = $3::jsonb, last_modified_at = now()
     WHERE user_id = $1`,
    [userId, JSON.stringify(nextProfile), JSON.stringify(nextBiodata)],
  );

  await logAudit({
    userId,
    action: 'biodata_write',
    resourceType: 'biodata',
    resourceId: (await params).userId,
    details: {
      profile_fields: Object.keys(body.profile_layer ?? {}),
      biodata_fields: Object.keys(body.biodata_layer ?? {}),
    },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({
    success: true,
    profile_layer: nextProfile,
    biodata_layer: nextBiodata,
  });
}
