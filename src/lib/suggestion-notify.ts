import { query } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { buildSuggestionNotificationEmail } from '@/lib/email-templates';
import { logger } from '@/lib/logger';

/**
 * Notify every active primary developer by email when a new suggestion is
 * submitted (founder report, 2026-07-28: "I'm not receiving suggestions" —
 * previously the only way to see one was to manually open the dev
 * dashboard). Fire-and-forget from the caller's point of view: `sendEmail`
 * already never throws, and this never blocks or fails the actual
 * suggestion-submission response — a missing/broken email provider must not
 * stop someone's feedback from being saved.
 */
export async function notifyDevsOfSuggestion(content: string, hospitalName?: string | null): Promise<void> {
  try {
    const { rows } = await query<{ email: string }>(
      `SELECT email FROM users
       WHERE account_type = 'developer' AND access_level = 'primary' AND is_active = TRUE`,
    );
    if (rows.length === 0) return;
    const { subject, html, text } = buildSuggestionNotificationEmail(content, hospitalName);
    await Promise.all(rows.map((r) => sendEmail({ to: r.email, subject, html, text })));
  } catch (err) {
    // Never let a notification failure surface to the suggestion submitter.
    logger.error('suggestion_notify_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}
