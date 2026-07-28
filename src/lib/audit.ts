import { query } from '@/lib/db';
import { logger, errMessage } from '@/lib/logger';

/**
 * Centralized audit logging. Writes an append-only row for every sensitive
 * access/action. Never include raw passwords, session tokens, or full biodata
 * values in `details` — only field names / identifiers.
 */

export type AuditAction =
  | 'biodata_read'
  | 'biodata_write'
  | 'biodata_shared_read'
  | 'biodata_lookup_no_match'
  | 'hospital_register'
  | 'hospital_update'
  | 'hospital_created_by_dev'
  | 'hospital_approved'
  | 'hospital_rejected'
  | 'announcement_change'
  | 'personnel_change'
  | 'first_aid_upload'
  | 'first_aid_edit'
  | 'first_aid_delete'
  | 'dev_account_change'
  | 'tertiary_account_change'
  | 'reminder_change'
  | 'doctor_consent_recorded'
  | 'doctor_consent_updated'
  | 'suggestion_submit'
  | 'suggestion_review'
  | 'password_change'
  | 'email_verified'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'rate_limited'
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
    logger.error('audit_log_write_failed', { action: entry.action, error: errMessage(err) });
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
