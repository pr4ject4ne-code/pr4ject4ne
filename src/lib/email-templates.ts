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

/**
 * Combined welcome + "confirm your email" message. Sent once, at signup.
 * Deliberately ONE email (not two) — a brand-new user gets a single inbox
 * item rather than two near-simultaneous ones. The IHN mention here is
 * intentionally light (just "an IHN code has been generated for you") — the
 * full IHN-warning detail (share carefully, it never rotates, etc.) is
 * worklist #19's job (forgot-password flow) and already lives in
 * IHNCodeDisplay.tsx; this email must not duplicate/contradict that copy.
 */
export function buildWelcomeVerificationEmail(verifyUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Confirm your Racoon Eye account';
  const text = [
    'Welcome to Racoon Eye!',
    '',
    'Your account has been created, along with a personal IHN code you can view any time from your dashboard.',
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
    <p><a href="${verifyUrl}">Confirm your email address</a> to finish setting up your account.</p>
    <p style="color:#666;font-size:0.9em;">This link expires in 48 hours. If you didn't create this account, you can safely ignore this email.</p>
  `.trim();
  return { subject, html, text };
}
