import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { apiError, apiOk, parseLimit, parseOffset } from '@/lib/api';
import { getPatientSession } from '@/lib/auth';

/**
 * Patient-facing "who has accessed my biodata via my IHN code" log (planner
 * Fix #2). The audit rows already exist (written by the [userId]/lookup
 * routes' authorizeRead/buildReadResult pipeline) — this just surfaces them
 * to the owning patient instead of leaving them dev-only (/api/dev/audit-logs).
 *
 * SECURITY-CRITICAL: the target resource id is ALWAYS `session.user_id` from
 * the verified session — never a query param or request body. This is the
 * single most important invariant in this route: without it, any patient
 * could read another patient's access history by tampering with a parameter.
 * There is no `userId`/`resource_id` input accepted from the client at all,
 * by design (not just "ignored" — it was never wired to anything).
 *
 * Only two action types are surfaced: `biodata_shared_read` (a cross-user IHN
 * redemption — granted or wrong-code) and `rate_limited` entries scoped to
 * this patient's biodata resource (a blocked probing burst). The owner's own
 * `biodata_read` rows (from viewing their own dashboard) are deliberately
 * excluded — those aren't "someone redeemed my IHN code", they're just the
 * account holder using their own account.
 */

const ACCESS_LOG_ACTIONS = ['biodata_shared_read', 'rate_limited'];

interface AccessLogDbRow {
  id: string;
  action_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Human-readable requester label derived from `details.requester`, a field
 * written by the redemption path itself: 'anonymous' | 'authenticated_patient'.
 * Missing (e.g. on historical rows predating that field, since `details` is
 * schemaless JSONB) is labeled 'Unknown' rather than failing.
 */
function requesterLabel(details: Record<string, unknown>): string {
  const requester = typeof details.requester === 'string' ? details.requester : null;
  if (requester === 'anonymous') return 'Anonymous (emergency access)';
  if (requester === 'authenticated_patient') return 'Signed-in patient';
  return 'Unknown';
}

type AccessLogOutcome = 'granted' | 'wrong_code' | 'blocked';

function outcomeFor(actionType: string, details: Record<string, unknown>): AccessLogOutcome {
  if (actionType === 'rate_limited') return 'blocked';
  if (details.result === 'ihn_mismatch') return 'wrong_code';
  return 'granted';
}

/** `details.fields_returned` is a string array written by buildReadResult on
 * a granted read — absent for mismatch/blocked rows. */
function fieldsReturnedFrom(details: Record<string, unknown>): string[] {
  const raw = details.fields_returned;
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is string => typeof f === 'string');
}

export interface AccessLogEntry {
  id: string;
  created_at: string;
  requester: string;
  outcome: AccessLogOutcome;
  fields_returned: string[];
}

/** GET — the caller's own IHN-code access history, newest first, paginated.
 * Deliberately excludes ip_address from the response (founder decision: raw
 * IP stays dev-only via /api/dev/audit-logs, not a new patient-facing PII
 * surface). */
export async function GET(req: Request) {
  const store = await cookies();
  const session = await getPatientSession((n) => store.get(n)?.value);
  if (!session) return apiError('Not authenticated.', 'UNAUTHENTICATED', 401);

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'), 20, 100);
  const offset = parseOffset(url.searchParams.get('offset'));

  // Always the session's own id. Never derived from any request input.
  const resourceId = session.user_id;

  const [totalRow, { rows }] = await Promise.all([
    query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs
       WHERE resource_type = 'biodata' AND resource_id = $1 AND action_type = ANY($2::text[])`,
      [resourceId, ACCESS_LOG_ACTIONS],
    ),
    query<AccessLogDbRow>(
      `SELECT id, action_type, details, created_at FROM audit_logs
       WHERE resource_type = 'biodata' AND resource_id = $1 AND action_type = ANY($2::text[])
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [resourceId, ACCESS_LOG_ACTIONS, limit, offset],
    ),
  ]);
  const total = Number(totalRow.rows[0]?.count ?? '0');

  const entries: AccessLogEntry[] = rows.map((row) => {
    const details = row.details ?? {};
    return {
      id: row.id,
      created_at: row.created_at,
      requester: requesterLabel(details),
      outcome: outcomeFor(row.action_type, details),
      fields_returned: fieldsReturnedFrom(details),
    };
  });

  return apiOk({ entries, total, limit, offset });
}
