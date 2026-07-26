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
 * Combined welcome + "confirm your email" message. Sent once, at signup.
 * Deliberately ONE email (not two) — a brand-new user gets a single inbox
 * item rather than two near-simultaneous ones. Worklist #19 adds a brief
 * IHN-security line here (this was previously deferred to #19 explicitly) —
 * kept short and consistent with IHNCodeDisplay.tsx's existing "why does this
 * matter" copy: never call the code "changeable"/"rotatable" (it's static by
 * design), just remind the reader to keep it private.
 */
export function buildWelcomeVerificationEmail(verifyUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Confirm your Racoon Eye account';
  const text = [
    'Welcome to Racoon Eye!',
    '',
    'Your account has been created, along with a personal IHN code you can view any time from your dashboard.',
    "Keep it private: your IHN code is a static emergency-access key that never changes, so only share it with people you trust to see your medical information in an emergency.",
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
    <p>Keep it private: your IHN code is a static emergency-access key that never changes, so only share it with people you trust to see your medical information in an emergency.</p>
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
export function buildPasswordResetEmail(resetUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Reset your Racoon Eye password';
  const text = [
    'We received a request to reset the password for your Racoon Eye account.',
    '',
    `Choose a new password here: ${resetUrl}`,
    '',
    'This link expires in 45 minutes and can only be used once.',
    '',
    "If you didn't request this, you can safely ignore this email — your password will not change.",
  ].join('\n');
  const html = `
    <p>We received a request to reset the password for your Racoon Eye account.</p>
    <p><a href="${resetUrl}">Choose a new password</a>.</p>
    <p style="color:#666;font-size:0.9em;">This link expires in 45 minutes and can only be used once. If you didn't request this, you can safely ignore this email — your password will not change.</p>
  `.trim();
  return { subject, html, text };
}
