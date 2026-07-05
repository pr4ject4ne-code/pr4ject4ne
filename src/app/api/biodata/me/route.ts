import { cookies } from 'next/headers';
import { queryOne, query } from '@/lib/db';
import { apiError, apiOk, readJson } from '@/lib/api';
import { getPatientSession } from '@/lib/auth';
import { logAudit, clientIpFrom } from '@/lib/audit';
import type { Biodata, BiodataLayer, ProfileLayer } from '@/types';

/**
 * Owner-only biodata access for the dashboard. The authenticated patient session
 * already proves ownership of this row, so no IHN header is needed here — the IHN
 * code is the SHARING/emergency factor used by /api/biodata/[userId], not the
 * owner's own bootstrap. Every read/write is still audit-logged.
 */

async function requireOwner() {
  const session = await getPatientSession((n) => cookies().get(n)?.value);
  return session?.user_id ?? null;
}

export async function GET(req: Request) {
  const userId = await requireOwner();
  if (!userId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const record = await queryOne<Biodata>(
    `SELECT user_id, profile_layer, biodata_layer, ihn_code, last_modified_at, created_at
     FROM biodata WHERE user_id = $1`,
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
    last_modified_at: record.last_modified_at,
  });
}

interface PatchBody {
  profile_layer?: ProfileLayer;
  biodata_layer?: BiodataLayer;
}

export async function PATCH(req: Request) {
  const userId = await requireOwner();
  if (!userId) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const body = await readJson<PatchBody>(req);
  if (!body || (!body.profile_layer && !body.biodata_layer)) {
    return apiError('Nothing to update.', 'BAD_REQUEST', 400);
  }

  const record = await queryOne<Biodata>(
    `SELECT profile_layer, biodata_layer FROM biodata WHERE user_id = $1`,
    [userId],
  );
  if (!record) return apiError('Biodata not found.', 'NOT_FOUND', 404);

  const nextProfile: ProfileLayer = { ...record.profile_layer, ...(body.profile_layer ?? {}) };
  const nextBiodata: BiodataLayer = { ...record.biodata_layer, ...(body.biodata_layer ?? {}) };

  // BMI is always derived server-side, never client-authoritative.
  if (typeof nextBiodata.height_cm === 'number' && typeof nextBiodata.weight_kg === 'number') {
    const h = nextBiodata.height_cm / 100;
    if (h > 0) nextBiodata.bmi = Math.round((nextBiodata.weight_kg / (h * h)) * 10) / 10;
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
    resourceId: userId,
    details: {
      profile_fields: Object.keys(body.profile_layer ?? {}),
      biodata_fields: Object.keys(body.biodata_layer ?? {}),
    },
    ip: clientIpFrom(req.headers),
  });

  return apiOk({ success: true, profile_layer: nextProfile, biodata_layer: nextBiodata });
}
