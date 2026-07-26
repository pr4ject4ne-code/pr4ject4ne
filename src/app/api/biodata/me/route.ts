import { cookies } from 'next/headers';
import { queryOne, query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getPatientSession } from '@/lib/auth';
import { sanitizeLayer, sanitizeClinicalConditions, safeHttpUrl } from '@/lib/sanitize';
import { logAudit, clientIpFrom } from '@/lib/audit';
import { normalizeSharingPrefs } from '@/lib/sharing-prefs';
import type { Biodata, BiodataLayer, ProfileLayer, SharingPrefs } from '@/types';

/**
 * Owner-only biodata access for the dashboard. The authenticated patient session
 * already proves ownership of this row, so no IHN header is needed here — the IHN
 * code is the SHARING/emergency factor used by /api/biodata/[userId], not the
 * owner's own bootstrap. Every read/write is still audit-logged.
 */

async function requireOwner() {
  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);
  return session?.user_id ?? null;
}

export async function GET(req: Request) {
  const userId = await requireOwner();
  if (!userId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  // Joins users.email_verified so the dashboard can show a non-blocking
  // "please verify your email" nudge (worklist #18) without a second request.
  const record = await queryOne<Biodata & { email_verified: boolean }>(
    `SELECT b.user_id, b.profile_layer, b.biodata_layer, b.ihn_code, b.sharing_prefs,
            b.last_modified_at, b.created_at, u.email_verified
     FROM biodata b
     JOIN users u ON u.id = b.user_id
     WHERE b.user_id = $1`,
    [userId],
  );
  if (!record) return apiError('Biodata not found.', 'NOT_FOUND', 404);

  await logAudit({
    userId,
    action: 'biodata_read',
    resourceType: 'biodata',
    resourceId: userId,
    details: { via: 'owner_dashboard' },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({
    user_id: record.user_id,
    profile_layer: record.profile_layer,
    biodata_layer: record.biodata_layer,
    ihn_code: record.ihn_code,
    // Always normalized here — the owner's dashboard toggle UI needs a
    // complete, well-formed object even for rows created before migration 013.
    sharing_prefs: normalizeSharingPrefs(record.sharing_prefs),
    last_modified_at: record.last_modified_at,
    email_verified: record.email_verified,
  });
}

interface PatchBody {
  profile_layer?: ProfileLayer;
  biodata_layer?: BiodataLayer;
  /** Worklist #23 — owner-only toggle of what's shareable via the IHN code.
   * Sent as a full object from the dashboard panel and stored as a full
   * replace (normalized/default-deny), not merged key-by-key. */
  sharing_prefs?: Partial<SharingPrefs>;
}

export async function PATCH(req: Request) {
  const userId = await requireOwner();
  if (!userId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const body = await readJson<PatchBody>(req);
  if (!body || (!body.profile_layer && !body.biodata_layer && !body.sharing_prefs)) {
    return apiError('Nothing to update.', 'BAD_REQUEST', 400);
  }

  // Reject non-object layers (a string/array would spread into corrupt keys) and
  // sanitize/cap each supplied layer before merging.
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
  // so validate + re-attach it explicitly when the biodata layer supplies it.
  if (body.biodata_layer && 'clinical_conditions' in body.biodata_layer) {
    (biodataPatch as Record<string, unknown>).clinical_conditions = sanitizeClinicalConditions(
      body.biodata_layer.clinical_conditions,
    );
  }

  const record = await queryOne<Biodata>(
    `SELECT profile_layer, biodata_layer, sharing_prefs FROM biodata WHERE user_id = $1`,
    [userId],
  );
  if (!record) return apiError('Biodata not found.', 'NOT_FOUND', 404);

  const nextProfile: ProfileLayer = { ...record.profile_layer, ...(profilePatch as Partial<ProfileLayer>) };
  const nextBiodata: BiodataLayer = { ...record.biodata_layer, ...(biodataPatch as Partial<BiodataLayer>) };

  // BMI is always derived server-side, never client-authoritative.
  if (typeof nextBiodata.height_cm === 'number' && typeof nextBiodata.weight_kg === 'number') {
    const h = nextBiodata.height_cm / 100;
    if (h > 0) nextBiodata.bmi = Math.round((nextBiodata.weight_kg / (h * h)) * 10) / 10;
  }

  // sharing_prefs (worklist #23): sent as a full object by the dashboard panel
  // and stored as a full REPLACE (not a partial merge) — normalizeSharingPrefs
  // is default-deny (only a literal `true` opts a section in), so an omitted
  // update simply keeps the previously-normalized value rather than resetting
  // anything.
  const nextSharingPrefs = normalizeSharingPrefs(
    body.sharing_prefs !== undefined ? body.sharing_prefs : record.sharing_prefs,
  );

  await query(
    `UPDATE biodata
     SET profile_layer = $2::jsonb, biodata_layer = $3::jsonb, sharing_prefs = $4::jsonb, last_modified_at = now()
     WHERE user_id = $1`,
    [userId, JSON.stringify(nextProfile), JSON.stringify(nextBiodata), JSON.stringify(nextSharingPrefs)],
  );

  await logAudit({
    userId,
    action: 'biodata_write',
    resourceType: 'biodata',
    resourceId: userId,
    details: {
      profile_fields: Object.keys(body.profile_layer ?? {}),
      biodata_fields: Object.keys(body.biodata_layer ?? {}),
      sharing_prefs_changed: body.sharing_prefs !== undefined,
    },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({
    success: true,
    profile_layer: nextProfile,
    biodata_layer: nextBiodata,
    sharing_prefs: nextSharingPrefs,
  });
}
