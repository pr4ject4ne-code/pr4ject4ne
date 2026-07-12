import { query } from '@/lib/db';

/**
 * Centralized audit logging. Writes an append-only row for every sensitive
 * access/action. Never include raw passwords, session tokens, or full biodata
 * values in `details` — only field names / identifiers.
 */

export type AuditAction =
  | 'biodata_read'
  | 'biodata_write'
  | 'hospital_register'
  | 'hospital_update'
  | 'announcement_change'
  | 'personnel_change'
  | 'first_aid_upload'
  | 'first_aid_edit'
  | 'first_aid_delete'
  | 'dev_account_change'
  | 'tertiary_account_change'
  | 'suggestion_review'
  | 'password_change'
  | 'login'
  | 'login_failed'
  | 'logout';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action_type, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.userId ?? null,
        entry.action,
        entry.resourceType ?? null,
        entry.resourceId ?? null,
        JSON.stringify(entry.details ?? {}),
        entry.ip ?? null,
      ],
    );
  } catch (err) {
    // Audit logging must never break the primary request; surface for ops.
    console.error('audit_log_write_failed', entry.action, err);
  }
}

/**
 * Best-effort client IP from a request's forwarded headers.
 *
 * Forwarded headers are client-controlled unless a trusted proxy sets them, so
 * they are only honored when TRUST_PROXY_HEADERS=true (set it only when the app
 * is deployed behind a proxy/load balancer that overwrites these headers).
 * Otherwise returns null — audit rows store a null IP and rate-limit callers
 * fall back to their 'unknown' bucket, rather than letting a client spoof
 * per-IP buckets or forge audit trails.
 */
export function clientIpFrom(headers: Headers): string | null {
  if (process.env.TRUST_PROXY_HEADERS !== 'true') return null;
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return headers.get('x-real-ip');
}
