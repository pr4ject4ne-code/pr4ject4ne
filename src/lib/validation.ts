/**
 * Pure input validation — no database or Node-only dependencies, so it is safe
 * to import from client components.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

/**
 * Password policy: ≥8 chars, at least one lowercase, one uppercase, one digit,
 * and one symbol.
 */
export function validatePasswordStrength(password: string): { ok: boolean; reason?: string } {
  if (typeof password !== 'string' || password.length < 8) {
    return { ok: false, reason: 'Password must be at least 8 characters.' };
  }
  if (password.length > 200) {
    return { ok: false, reason: 'Password is too long.' };
  }
  if (!/[a-z]/.test(password)) return { ok: false, reason: 'Include a lowercase letter.' };
  if (!/[A-Z]/.test(password)) return { ok: false, reason: 'Include an uppercase letter.' };
  if (!/[0-9]/.test(password)) return { ok: false, reason: 'Include a number.' };
  if (!/[^A-Za-z0-9]/.test(password)) return { ok: false, reason: 'Include a symbol.' };
  return { ok: true };
}
