/**
 * Pure input validation — no database or Node-only dependencies, so it is safe
 * to import from client components.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

export interface PasswordRuleCheck {
  key: 'length' | 'lowercase' | 'uppercase' | 'digit' | 'symbol';
  label: string;
  met: boolean;
}

/**
 * Individual password rule checks, in priority order, so UI (strength
 * checklist) and server validation (validatePasswordStrength below) share a
 * single source of truth for what the policy requires.
 */
export function getPasswordChecks(password: string): PasswordRuleCheck[] {
  const pw = typeof password === 'string' ? password : '';
  return [
    { key: 'length', label: 'At least 8 characters', met: pw.length >= 8 && pw.length <= 200 },
    { key: 'lowercase', label: 'One lowercase letter', met: /[a-z]/.test(pw) },
    { key: 'uppercase', label: 'One uppercase letter', met: /[A-Z]/.test(pw) },
    { key: 'digit', label: 'One number', met: /[0-9]/.test(pw) },
    { key: 'symbol', label: 'One symbol', met: /[^A-Za-z0-9]/.test(pw) },
  ];
}

const RULE_REASONS: Record<PasswordRuleCheck['key'], string> = {
  length: 'Password must be at least 8 characters.',
  lowercase: 'Include a lowercase letter.',
  uppercase: 'Include an uppercase letter.',
  digit: 'Include a number.',
  symbol: 'Include a symbol.',
};

/**
 * Password policy: ≥8 chars, at least one lowercase, one uppercase, one digit,
 * and one symbol.
 */
export function validatePasswordStrength(password: string): { ok: boolean; reason?: string } {
  if (typeof password === 'string' && password.length > 200) {
    return { ok: false, reason: 'Password is too long.' };
  }
  const failed = getPasswordChecks(password).find((check) => !check.met);
  if (failed) return { ok: false, reason: RULE_REASONS[failed.key] };
  return { ok: true };
}
