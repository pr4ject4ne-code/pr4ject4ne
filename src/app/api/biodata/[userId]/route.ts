import { cookies } from 'next/headers';
import { queryOne, query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getPatientSession, checkRateLimit, constantTimeEquals } from '@/lib/auth';
import { sanitizeLayer, sanitizeClinicalConditions, safeHttpUrl } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { isValidIhnCode } from '@/lib/ihn-code';
import { normalizeSharingPrefs, filterBiodataBySharingPrefs } from '@/lib/sharing-prefs';
import { stripDoctorIdsFromClinicalConditions } from '@/lib/biodata-response';
import type { Biodata, BiodataLayer, ProfileLayer } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Biodata READ access is gated by BOTH:
 *  1. A valid patient session (cookie) — of ANY patient, not just the owner, AND
 *  2. The correct IHN code (X-IHN-Code header) for the TARGET row.
 *
 * The owner reading their own row via this route behaves exactly as before
 * (full profile_layer + biodata_layer, unaffected by sharing_prefs — that only
 * gates the OTHER-user path). A DIFFERENT authenticated patient may now also
 * read the target's row if they supply the correct IHN code, but the response
 * is filtered through `filterBiodataBySharingPrefs` against the OWNER's own
 * `sharing_prefs` (worklist #23) — nothing is shared until the owner opts a
 * section in from their dashboard. This is the fix for the long-flagged
 * "IHN sharing is a dead path" gap: the IHN code parameter was previously
 * unreachable because ownership was required BEFORE the code was ever checked.
 *
 * WRITE access (PATCH) is unchanged and stays strictly owner-only — see
 * authorizeWrite below.
 */

const SHARED_READ_TARGET_MAX = 10;
const SHARED_READ_TARGET_WINDOW_SECONDS = 60 * 60; // 1 hour
const SHARED_READ_IP_MAX = 30;
const SHARED_READ_IP_WINDOW_SECONDS = 60 * 60; // 1 hour

interface ReadAuthorized {
  requesterId: string;
  targetUserId: string;
  isOwner: boolean;
  record: Biodata;
}

interface WriteAuthorized {
  userId: string;
  record: Biodata;
}

async function loadSession(headers: Headers) {
  const store = await cookies();
  return getPatientSession((n) => store.get(n)?.value);
}

/**
 * READ authorization: owner (same session.user_id) OR any other authenticated
 * patient session presenting the correct IHN code for the target.
 *
 * Rate limiting uses DISTINCT buckets per threat model:
 *  - owner reading their own data: `biodata:<userId>` (unchanged, 10/min) — a
 *    legitimate owner hitting their own data repeatedly.
 *  - cross-user reads: TWO buckets, since an attacker guessing/brute-forcing
 *    ANOTHER person's IHN code is a different abuse pattern entirely —
 *    `biodata_shared_target:<targetUserId>` (bounds attempts against ONE
 *    victim, the real brute-force threat) AND `biodata_shared_ip:<ip>`
 *    (bounds a single attacker spraying guesses across MANY targets), mirroring
 *    the dual per-IP + per-email bucket design already used by
 *    forgot-password (see src/lib/auth.ts / memory 2026-07-26).
 */
/**
 * Exported (not just used internally) so the by-IHN-code lookup path (worklist
 * #24/#25's "string tab") can call the EXACT same session/rate-limit/IHN-match
 * logic once it has resolved a code to a target user id — no parallel/weaker
 * reimplementation of this authorization boundary.
 */
export async function authorizeRead(
  paramUserId: string,
  headers: Headers,
): Promise<{ ok: true; data: ReadAuthorized } | { ok: false; response: ReturnType<typeof apiError> }> {
  if (!UUID_RE.test(paramUserId)) {
    return { ok: false, response: apiError('Not found.', 'NOT_FOUND', 404) };
  }

  const session = await loadSession(headers);
  if (!session) {
    return { ok: false, response: apiError('Not authenticated.', 'UNAUTHENTICATED', 401) };
  }

  const isOwner = session.user_id === paramUserId;

  if (isOwner) {
    const allowed = await checkRateLimit(`biodata:${session.user_id}`, 10, 60);
    if (!allowed) {
      return { ok: false, response: apiError('Too many attempts.', 'RATE_LIMITED', 429) };
    }
  } else {
    const targetAllowed = await checkRateLimit(
      `biodata_shared_target:${paramUserId}`,
      SHARED_READ_TARGET_MAX,
      SHARED_READ_TARGET_WINDOW_SECONDS,
    );
    const ip = clientIpFrom(headers) ?? 'unknown';
    const ipAllowed = await checkRateLimit(
      `biodata_shared_ip:${ip}`,
      SHARED_READ_IP_MAX,
      SHARED_READ_IP_WINDOW_SECONDS,
    );
    if (!targetAllowed || !ipAllowed) {
      // A string of throttled cross-user attempts against one target is
      // exactly the brute-force signal to watch for — same reasoning as
      // logging IHN mismatches below, not just successful reads.
      await logAudit({
        userId: session.user_id,
        action: 'rate_limited',
        resourceType: 'biodata',
        resourceId: paramUserId,
        details: { endpoint: 'biodata_shared_read' },
        ip,
      });
      return { ok: false, response: apiError('Too many attempts.', 'RATE_LIMITED', 429) };
    }
  }

  const ihnHeader = headers.get('x-ihn-code')?.trim() ?? '';
  if (!isValidIhnCode(ihnHeader)) {
    return { ok: false, response: apiError('IHN code required.', 'IHN_REQUIRED', 401) };
  }

  const record = await queryOne<Biodata>(
    `SELECT user_id, profile_layer, biodata_layer, ihn_code, sharing_prefs, last_modified_at, created_at
     FROM biodata WHERE user_id = $1`,
    [paramUserId],
  );
  if (!record) {
    return { ok: false, response: apiError('Not found.', 'NOT_FOUND', 404) };
  }
  if (!constantTimeEquals(record.ihn_code, ihnHeader)) {
    // Logged even on failure — a wrong-code attempt against a real target is
    // exactly the abuse signal this needs to catch, not just successful reads.
    await logAudit({
      userId: session.user_id,
      action: isOwner ? 'biodata_read' : 'biodata_shared_read',
      resourceType: 'biodata',
      resourceId: paramUserId,
      details: { result: 'ihn_mismatch', via: isOwner ? 'owner' : 'cross_user' },
      ip: clientIpFrom(headers),
    });
    return { ok: false, response: apiError('Invalid IHN code.', 'IHN_INVALID', 401) };
  }

  return { ok: true, data: { requesterId: session.user_id, targetUserId: paramUserId, isOwner, record } };
}

/**
 * WRITE authorization: unchanged from before this task — strictly owner-only.
 * Sharing a read via IHN never implies write access.
 */
async function authorizeWrite(
  paramUserId: string,
  headers: Headers,
): Promise<{ ok: true; data: WriteAuthorized } | { ok: false; response: ReturnType<typeof apiError> }> {
  if (!UUID_RE.test(paramUserId)) {
    return { ok: false, response: apiError('Not found.', 'NOT_FOUND', 404) };
  }

  const session = await loadSession(headers);
  if (!session) {
    return { ok: false, response: apiError('Not authenticated.', 'UNAUTHENTICATED', 401) };
  }
  if (session.user_id !== paramUserId) {
    return { ok: false, response: apiError('Forbidden.', 'FORBIDDEN', 403) };
  }

  const allowed = await checkRateLimit(`biodata:${session.user_id}`, 10, 60);
  if (!allowed) {
    return { ok: false, response: apiError('Too many attempts.', 'RATE_LIMITED', 429) };
  }

  const ihnHeader = headers.get('x-ihn-code')?.trim() ?? '';
  if (!isValidIhnCode(ihnHeader)) {
    return { ok: false, response: apiError('IHN code required.', 'IHN_REQUIRED', 401) };
  }

  const record = await queryOne<Biodata>(
    `SELECT user_id, profile_layer, biodata_layer, ihn_code, sharing_prefs, last_modified_at, created_at
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

export interface BiodataReadResult {
  user_id: string;
  profile_layer: Partial<ProfileLayer>;
  biodata_layer: Partial<BiodataLayer>;
  ihn_code?: string;
  last_modified_at: string;
}

/**
 * Builds the (already-filtered, audit-logged) read response for an authorized
 * request. Extracted so the by-IHN-code lookup route (#24/#25) can produce the
 * identical response shape/logging as this route's own GET, rather than
 * duplicating the owner-vs-cross-user branching.
 */
export async function buildReadResult(data: ReadAuthorized, headers: Headers): Promise<BiodataReadResult> {
  const { requesterId, targetUserId, isOwner, record } = data;

  if (isOwner) {
    await logAudit({
      userId: requesterId,
      action: 'biodata_read',
      resourceType: 'biodata',
      resourceId: targetUserId,
      details: { via: 'ihn_code' },
      ip: clientIpFrom(headers),
    });
    return {
      user_id: record.user_id,
      profile_layer: record.profile_layer,
      biodata_layer: record.biodata_layer,
      ihn_code: record.ihn_code,
      last_modified_at: record.last_modified_at,
    };
  }

  // Cross-user read: filter server-side through the OWNER's sharing_prefs.
  // Never trust the client to do this — the client only ever sees the
  // already-filtered result.
  const prefs = normalizeSharingPrefs(record.sharing_prefs);
  const filtered = filterBiodataBySharingPrefs(record.profile_layer, record.biodata_layer, prefs);
  const fieldsReturned = [
    ...Object.keys(filtered.profile_layer),
    ...Object.keys(filtered.biodata_layer),
  ];

  await logAudit({
    userId: requesterId,
    action: 'biodata_shared_read',
    resourceType: 'biodata',
    resourceId: targetUserId,
    details: { via: 'ihn_code', fields_returned: fieldsReturned },
    ip: clientIpFrom(headers),
  });

  // ihn_code is intentionally omitted here — the requester already supplied
  // it, and a cross-user response should carry the least possible privilege.
  return {
    user_id: record.user_id,
    profile_layer: filtered.profile_layer,
    biodata_layer: filtered.biodata_layer,
    last_modified_at: record.last_modified_at,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const paramUserId = (await params).userId;
  const auth = await authorizeRead(paramUserId, req.headers);
  if (!auth.ok) return auth.response;

  const result = await buildReadResult(auth.data, req.headers);

  // Cross-user (non-owner) responses must never carry a raw doctor_id — see
  // stripDoctorIdsFromClinicalConditions's doc comment. This route shares the
  // exact authorizeRead/buildReadResult pipeline the /api/biodata/lookup
  // route uses, so it needs the identical strip on its own response, not
  // just on the lookup route's. The owner's own read is unaffected (their
  // own doctor_id on their own data is not a leak).
  if (!auth.data.isOwner) {
    return apiOk({ ...result, biodata_layer: stripDoctorIdsFromClinicalConditions(result.biodata_layer) });
  }
  return apiOk(result);
}

interface PatchBody {
  profile_layer?: ProfileLayer;
  biodata_layer?: BiodataLayer;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await authorizeWrite((await params).userId, req.headers);
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

  // profile_photo_url flows into an <img src> — sanitizeLayer only escapes HTML,
  // it does not validate URL scheme, so re-validate with safeHttpUrl (blocks
  // javascript:/data: URLs). An empty/invalid value clears the field.
  if (body.profile_layer && 'profile_photo_url' in body.profile_layer) {
    const raw = body.profile_layer.profile_photo_url;
    (profilePatch as Record<string, unknown>).profile_photo_url = raw
      ? (safeHttpUrl(raw) ?? undefined)
      : undefined;
  }

  // clinical_conditions is a whitelisted nested array; sanitizeLayer drops arrays,
  // so validate + re-attach it explicitly when supplied (mirrors /api/biodata/me).
  if (body.biodata_layer && 'clinical_conditions' in body.biodata_layer) {
    (biodataPatch as Record<string, unknown>).clinical_conditions = sanitizeClinicalConditions(
      body.biodata_layer.clinical_conditions,
    );
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
