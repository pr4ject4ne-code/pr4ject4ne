import { logger, errMessage } from '@/lib/logger';

/**
 * Thin, mockable wrapper around the Resend SDK (worklist #18/#19). This is the
 * ONLY module in the codebase allowed to touch the `resend` package — every
 * outbound email (signup confirmation, welcome, later forgot-password) must
 * go through `sendEmail()` here so the dev-fallback logic lives in exactly
 * one place and tests can mock this module instead of the SDK.
 *
 * Chosen provider: Resend — no-card-required free tier, consistent with this
 * project's standing pattern of avoiding billing-signup friction (same
 * reasoning that picked MapTiler/OSRM/Leaflet over Mapbox/ORS, and kept
 * Supabase Storage over Cloudflare R2 when R2 turned out to require a card).
 *
 * DEV FALLBACK: if RESEND_API_KEY is unset (no founder account exists yet),
 * this logs a loud structured warning with what WOULD have been sent instead
 * of throwing or silently no-op'ing — a missing key must be obvious in
 * production logs, but must never crash the caller (signup especially must
 * succeed even if email delivery is unavailable).
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback; recommended for deliverability. */
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
}

/** Outbound calls must not hang a request indefinitely on a Resend outage. */
const EMAIL_SEND_TIMEOUT_MS = 8000;
const TRUNCATED_PREVIEW_LENGTH = 200;

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

/**
 * Dev-fallback log previews must never carry a live single-use token or full
 * recipient PII, even incidentally — strip any URL (where a verification/
 * reset token lives as a query param) before truncating, and log only the
 * recipient's domain, not the full address.
 */
function redactPreview(value: string): string {
  return truncate(value.replace(/https?:\/\/\S+/g, '[link omitted]'), TRUNCATED_PREVIEW_LENGTH);
}

function maskRecipient(email: string): string {
  const at = email.indexOf('@');
  return at === -1 ? '[redacted]' : `[redacted]@${email.slice(at + 1)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('email_send_timeout')), ms);
    }),
  ]);
}

/**
 * Send an email via Resend, or log-and-degrade gracefully if no API key is
 * configured or the send fails for any reason. NEVER throws — callers (e.g.
 * signup) must be able to fire-and-check this without a try/catch of their
 * own to keep working even during a Resend outage.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    logger.warn('email_not_sent_no_api_key', {
      to: maskRecipient(input.to),
      subject: input.subject,
      preview: redactPreview(input.text ?? input.html),
    });
    return { sent: false };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Racoon Eye <onboarding@resend.dev>';

  try {
    // Lazy import so the `resend` package is never touched (or required) on
    // the no-key dev-fallback path above.
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const result = await withTimeout(
      resend.emails.send({ from, to: input.to, subject: input.subject, html: input.html, text: input.text }),
      EMAIL_SEND_TIMEOUT_MS,
    );
    if (result.error) {
      logger.error('email_send_failed', {
        to: maskRecipient(input.to),
        subject: input.subject,
        error: result.error.message,
      });
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    // A Resend outage/timeout/SDK error must degrade, not throw — the caller
    // (e.g. signup) must succeed regardless of email-provider health.
    logger.error('email_send_failed', {
      to: maskRecipient(input.to),
      subject: input.subject,
      error: errMessage(err),
    });
    return { sent: false };
  }
}
