/**
 * Plain-text/HTML content for transactional emails (worklist #18). Kept
 * separate from the signup route so the copy is easy to review/reuse (e.g.
 * a future "resend verification" action) without touching route logic.
 */

/** Base site URL used to build absolute links in emails. Falls back to
 * localhost in dev so this never throws when SITE_URL is unset. */
export function getSiteUrl(): string {
  return process.env.SITE_URL || 'http://localhost:3000';
}

export function buildVerifyEmailUrl(token: string): string {
  const url = new URL('/api/auth/verify-email', getSiteUrl());
  url.searchParams.set('token', token);
  return url.toString();
}

export function buildResetPasswordUrl(token: string): string {
  const url = new URL('/reset-password', getSiteUrl());
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Combined welcome and "confirm your email" message. Sent once, at signup.
 * Deliberately ONE email (not two): a brand-new user gets a single inbox
 * item rather than two near-simultaneous ones. Worklist #19 adds a brief
 * IHN-security line here (this was previously deferred to #19 explicitly),
 * kept short and consistent with IHNCodeDisplay.tsx's own "why does this
 * matter" copy.
 */
export function buildWelcomeVerificationEmail(verifyUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Confirm your Racoon Eye account';
  const text = [
    'Welcome to Racoon Eye!',
    '',
    'Your account has been created, along with a personal IHN code you can view any time from your dashboard.',
    'Keep it private: your IHN code is your emergency-access key, so only share it with people you trust to see your medical information in an emergency.',
    '',
    `Please confirm your email address to finish setting up your account: ${verifyUrl}`,
    '',
    'This link expires in 48 hours.',
    '',
    "If you didn't create this account, you can safely ignore this email.",
  ].join('\n');
  const html = `
    <p>Welcome to Racoon Eye!</p>
    <p>Your account has been created, along with a personal IHN code you can view any time from your dashboard.</p>
    <p>Keep it private: your IHN code is your emergency-access key, so only share it with people you trust to see your medical information in an emergency.</p>
    <p><a href="${verifyUrl}">Confirm your email address</a> to finish setting up your account.</p>
    <p style="color:#666;font-size:0.9em;">This link expires in 48 hours. If you didn't create this account, you can safely ignore this email.</p>
  `.trim();
  return { subject, html, text };
}

/**
 * Forgot-password email (worklist #19). Sent only when the requesting email
 * matches a real account — the enumeration-safety guard lives in the calling
 * route (POST /api/auth/forgot-password), never here; this template just
 * renders the message once a real recipient/token pair has been decided.
 */
/**
 * New-suggestion notification, sent to every active primary developer
 * (worklist follow-up, founder report 2026-07-28: "I'm not receiving
 * suggestions" — submissions were only ever visible by manually opening the
 * dev dashboard; there was no push notification at all). `hospitalName` is
 * set for a hospital-scoped suggestion, omitted for general site feedback.
 */
export function buildSuggestionNotificationEmail(
  content: string,
  hospitalName?: string | null,
): { subject: string; html: string; text: string } {
  const boardUrl = new URL('/dev/dashboard', getSiteUrl()).toString();
  const subject = hospitalName
    ? `New suggestion for ${hospitalName}`
    : 'New site suggestion received';
  const text = [
    hospitalName ? `A new suggestion was submitted for ${hospitalName}:` : 'A new site suggestion was submitted:',
    '',
    content,
    '',
    `Review it on the dev dashboard: ${boardUrl}`,
  ].join('\n');
  const html = `
    <p>${hospitalName ? `A new suggestion was submitted for <strong>${hospitalName}</strong>:` : 'A new site suggestion was submitted:'}</p>
    <blockquote style="border-left:3px solid #ccc;margin:0.5em 0;padding-left:1em;color:#333;">${content}</blockquote>
    <p><a href="${boardUrl}">Review it on the dev dashboard</a>.</p>
  `.trim();
  return { subject, html, text };
}

export function buildPasswordResetEmail(resetUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Reset your Racoon Eye password';
  const text = [
    'We received a request to reset the password for your Racoon Eye account.',
    '',
    `Choose a new password here: ${resetUrl}`,
    '',
    'This link expires in 45 minutes and can only be used once.',
    '',
    "If you didn't request this, you can safely ignore this email, your password will not change.",
  ].join('\n');
  const html = `
    <p>We received a request to reset the password for your Racoon Eye account.</p>
    <p><a href="${resetUrl}">Choose a new password</a>.</p>
    <p style="color:#666;font-size:0.9em;">This link expires in 45 minutes and can only be used once. If you didn't request this, you can safely ignore this email, your password will not change.</p>
  `.trim();
  return { subject, html, text };
}

/**
 * Item 4: sent when a patient requests doctor confirmation of a specific
 * clinical-condition entry. Deliberately itemizes ONE field per email (the
 * field this exact doctor_consent_records row is scoped to, migration 029)
 * rather than a whole-record summary — the point of the field-level rework
 * is that a doctor should only ever be asked about, and credited for,
 * exactly what they're shown here. No link for the doctor to click: there is
 * still no doctor-account/login concept in this app (deliberate, documented
 * scope decision) — they reply by email, and a developer records the
 * outcome via the dev consent tool.
 */
export function buildDoctorConsentRequestEmail(opts: {
  doctorName: string;
  patientName: string;
  fieldLabel: string; // e.g. "Condition"
  fieldValue: string; // e.g. "Hypertension"
  replyToEmail: string;
}): { subject: string; html: string; text: string } {
  const { doctorName, patientName, fieldLabel, fieldValue, replyToEmail } = opts;
  const subject = `Confirmation requested: ${patientName}'s medical record on Racoon Eye`;
  const text = [
    `Dear Dr. ${doctorName},`,
    '',
    `${patientName} has asked you to confirm the following entry on their Racoon Eye medical record, so it can be shown to others as doctor-confirmed:`,
    '',
    `${fieldLabel}: ${fieldValue}`,
    '',
    'Please reply to this email to let us know whether you confirm this entry. We will record your decision and, once confirmed, your name will be shown alongside this entry as the confirming doctor.',
    '',
    "If you don't recognize this patient or don't wish to be credited, just reply to say so — nothing will be shown without your confirmation.",
    '',
    `Reply to: ${replyToEmail}`,
  ].join('\n');
  const html = `
    <p>Dear Dr. ${doctorName},</p>
    <p>${patientName} has asked you to confirm the following entry on their Racoon Eye medical record, so it can be shown to others as doctor-confirmed:</p>
    <table style="border-collapse:collapse;margin:0.75em 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#666;">${fieldLabel}</td><td style="padding:4px 0;font-weight:600;">${fieldValue}</td></tr>
    </table>
    <p>Please reply to this email to let us know whether you confirm this entry. We will record your decision and, once confirmed, your name will be shown alongside this entry as the confirming doctor.</p>
    <p style="color:#666;font-size:0.9em;">If you don't recognize this patient or don't wish to be credited, just reply to say so — nothing will be shown without your confirmation.</p>
  `.trim();
  return { subject, html, text };
}
