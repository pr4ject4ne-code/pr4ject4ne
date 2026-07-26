import { cookies } from 'next/headers';
import { queryOne } from '@/lib/db';
import { apiError, apiOk } from '@/lib/api';
import { getPatientSession, checkRateLimit } from '@/lib/auth';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { isValidIhnCode } from '@/lib/ihn-code';
import { authorizeRead, buildReadResult } from '@/app/api/biodata/[userId]/route';
import { fetchDoctorAttributionLookup } from '@/lib/doctor-consent-db';
import { buildDoctorReport } from '@/lib/doctor-report';
import { stripDoctorIdsFromClinicalConditions } from '@/lib/biodata-response';

/**
 * By-IHN-code lookup (worklist #24's "string tab"). `biodata.ihn_code` is
 * UNIQUE (migration 001), so a code alone is a sufficient lookup key — a
 * person in an emergency has the code (and maybe a name), not the target's
 * internal UUID that `GET /api/biodata/[userId]` is keyed on. This route
 * resolves code -> user_id, then hands off to the EXACT SAME
 * `authorizeRead`/`buildReadResult` pipeline `[userId]/route.ts` uses — no
 * parallel/weaker read path, no bypass of sharing_prefs.
 *
 * Rate limiting: the resolution step (code -> user id) happens BEFORE we know
 * which user_id bucket to use, so it gets its own sibling buckets
 * (`biodata_lookup_code`/`biodata_lookup_ip`, same limits as the existing
 * `biodata_shared_target`/`biodata_shared_ip`). Once resolved, `authorizeRead`
 * ALSO applies its own `biodata_shared_target`/`biodata_shared_ip` buckets
 * against the real resource — that reuse (not duplication) is intentional
 * defense in depth, not a second weaker gate.
 *
 * Enumeration safety: "no user has this code" and "a user has this code but
 * opted nothing in" are collapsed into the exact same response shape
 * (`available: false`) so this endpoint can never confirm whether a given IHN
 * code is even registered — same principle as #19's forgot-password. The
 * distinction IS still recorded, but only in the audit log (dev-visible),
 * never in the API response.
 */

const LOOKUP_CODE_MAX = 10;
const LOOKUP_CODE_WINDOW_SECONDS = 60 * 60; // 1 hour
const LOOKUP_IP_MAX = 30;
const LOOKUP_IP_WINDOW_SECONDS = 60 * 60; // 1 hour

export async function GET(req: Request) {
  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);
  if (!session) {
    return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);
  }

  const url = new URL(req.url);
  const rawCode = (url.searchParams.get('ihn') ?? '').trim().toUpperCase();
  if (!isValidIhnCode(rawCode)) {
    return apiError('Enter a valid IHN code (format IHN-XXXX-XXXX-XXXX).', 'BAD_REQUEST', 400);
  }

  const ip = clientIpFrom(req.headers) ?? 'unknown';
  const codeAllowed = await checkRateLimit(`biodata_lookup_code:${rawCode}`, LOOKUP_CODE_MAX, LOOKUP_CODE_WINDOW_SECONDS);
  const ipAllowed = await checkRateLimit(`biodata_lookup_ip:${ip}`, LOOKUP_IP_MAX, LOOKUP_IP_WINDOW_SECONDS);
  if (!codeAllowed || !ipAllowed) {
    await logAudit({
      userId: session.user_id,
      action: 'rate_limited',
      resourceType: 'biodata',
      details: { endpoint: 'biodata_lookup' },
      ip: clientIpFrom(req.headers),
    });
    return apiError('Too many attempts.', 'RATE_LIMITED', 429);
  }

  const row = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM biodata WHERE ihn_code = $1',
    [rawCode],
  );

  if (!row) {
    // Logged for dev visibility (a code that matches no one at all is a
    // distinct, useful signal from "matched but nothing shared") — but the
    // CLIENT response below is identical to the nothing-shared case.
    await logAudit({
      userId: session.user_id,
      action: 'biodata_lookup_no_match',
      resourceType: 'biodata',
      details: { ihn_code: rawCode },
      ip: clientIpFrom(req.headers),
    });
    return apiOk({ available: false, profile_layer: {}, biodata_layer: {}, report: null });
  }

  // Reuse the SAME authorization pipeline as the direct userId route: it
  // re-applies its own rate limits, re-derives owner-vs-cross-user, and
  // filters strictly through the owner's sharing_prefs. The resolved code is
  // forwarded as the X-IHN-Code header exactly as a direct caller would send it.
  const headersWithIhn = new Headers(req.headers);
  headersWithIhn.set('x-ihn-code', rawCode);
  const auth = await authorizeRead(row.user_id, headersWithIhn);
  if (!auth.ok) return auth.response;

  const result = await buildReadResult(auth.data, headersWithIhn);
  const nothingShared =
    Object.keys(result.profile_layer).length === 0 && Object.keys(result.biodata_layer).length === 0;

  // ihn_code is never echoed back on this lookup surface, even for the rare
  // case where someone looks up their own code.
  if (nothingShared) {
    return apiOk({ available: false, profile_layer: {}, biodata_layer: {}, report: null });
  }

  // Report generation (worklist #29/#30) — built strictly FROM this
  // already-filtered read, never an independent unfiltered one. Only the
  // doctor_ids actually present in the (already-filtered) clinical_conditions
  // are looked up — a doctor who isn't credited here never has their consent
  // status touched by this request at all. Consent is resolved for THIS
  // EXACT patient (`row.user_id`, the biodata owner already resolved above —
  // never anything derived from request input) — see migration 016 and
  // src/lib/doctor-consent-db.ts: a doctor approved for a DIFFERENT patient
  // must never be credited here.
  const doctorIds = (result.biodata_layer.clinical_conditions ?? [])
    .map((c) => c.doctor_id)
    .filter((id): id is string => typeof id === 'string');
  const doctorLookup = await fetchDoctorAttributionLookup(doctorIds, row.user_id);
  const report = buildDoctorReport(result.profile_layer, result.biodata_layer, doctorLookup);

  // Strip doctor_id from the RAW biodata_layer before it's returned — the
  // report (built above) already surfaces attribution correctly through its
  // own gated pipeline; leaving the raw UUID in biodata_layer would let any
  // authenticated caller cross-reference it against the public doctor roster
  // (GET /api/hospitals/[id]) and learn exactly which doctor was credited,
  // even when consent is denied/pending/nonexistent — defeating the whole
  // point of the report's anonymization. This mutates only the RESPONSE
  // shape, never the stored record.
  const sanitizedBiodataLayer = stripDoctorIdsFromClinicalConditions(result.biodata_layer);

  return apiOk({
    available: true,
    profile_layer: result.profile_layer,
    biodata_layer: sanitizedBiodataLayer,
    report,
  });
}
