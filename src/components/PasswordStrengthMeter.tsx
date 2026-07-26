'use client';

import { getPasswordChecks } from '@/lib/validation';
import styles from './LoginForm.module.css';

type StrengthLevel = 'weak' | 'medium' | 'strong';

const STRENGTH_LABEL: Record<StrengthLevel, string> = {
  weak: 'Weak',
  medium: 'Fair',
  strong: 'Strong',
};

/**
 * Live password-strength checklist, extracted from LoginForm (worklist #17)
 * so the reset-password form (worklist #19) can reuse the exact same UI
 * instead of duplicating the checklist markup. Reuses LoginForm.module.css's
 * `.strength*`/`.check*` classes directly (same visual language, no new CSS).
 */
export default function PasswordStrengthMeter({
  password,
  id,
}: {
  password: string;
  id?: string;
}) {
  if (!password) return null;

  const checks = getPasswordChecks(password);
  const metCount = checks.filter((check) => check.met).length;
  const level: StrengthLevel = metCount <= 1 ? 'weak' : metCount <= 3 ? 'medium' : 'strong';

  return (
    <div className={styles.strength} id={id}>
      <div className={styles.strengthBar} aria-hidden="true">
        {checks.map((check, i) => (
          <span
            key={check.key}
            className={`${styles.strengthPill} ${i < metCount ? styles[`strength-${level}`] : ''}`}
          />
        ))}
      </div>
      <p className={styles.strengthLabel} aria-live="polite">
        Password strength: {STRENGTH_LABEL[level]}
      </p>
      <ul className={styles.strengthChecklist}>
        {checks.map((check) => (
          <li key={check.key} className={check.met ? styles.checkMet : styles.checkUnmet}>
            <span aria-hidden="true">{check.met ? '✓' : '○'}</span> {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
