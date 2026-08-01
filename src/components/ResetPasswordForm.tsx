'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Input from './Input';
import Button from './Button';
import Card from './Card';
import PasswordStrengthMeter from './PasswordStrengthMeter';
import ErrorBubble from './ErrorBubble';
import { validatePasswordStrength } from '@/lib/validation';
import { scrollToFirstInvalidField } from '@/lib/scrollToError';
import styles from './LoginForm.module.css';
import buttonStyles from './Button.module.css';

const PASSWORD_STRENGTH_ID = 'reset-password-strength';

/**
 * Reset-password form (worklist #19). Reads the token from the URL query
 * param (rendered by the page component) and reuses the exact same live
 * password-strength checklist component signup uses (#17), rather than
 * duplicating that markup.
 */
export default function ResetPasswordForm({ token }: { token: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    const strength = validatePasswordStrength(password);
    if (!strength.ok) next.password = strength.reason!;
    if (password !== confirm) next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!token) {
      setServerError('This reset link is invalid.');
      return;
    }
    if (!validate()) {
      scrollToFirstInvalidField(formRef.current);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? 'Something went wrong.');
        return;
      }
      setDone(true);
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <Card variant="plain" className={styles.card}>
        <h1 className={styles.title}>Invalid link</h1>
        <p className={styles.subtitle}>
          This reset link is missing its token. Double-check you copied the full link from your
          email, or request a new one.
        </p>
        <p className={styles.backLink}>
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </Card>
    );
  }

  if (done) {
    return (
      <Card variant="plain" className={styles.card}>
        <h1 className={styles.title}>Password changed</h1>
        <p className={styles.subtitle}>
          Your password has been reset. You&apos;ve been signed out everywhere, so log in again
          with your new password.
        </p>
        <Link
          href="/login"
          className={`${buttonStyles.btn} ${buttonStyles.primary} ${styles.submit}`}
        >
          Log in
        </Link>
      </Card>
    );
  }

  return (
    <Card variant="plain" className={styles.card}>
      <h1 className={styles.title}>Choose a new password</h1>
      <p className={styles.subtitle}>Enter a new password for your account.</p>
      <form ref={formRef} onSubmit={onSubmit} noValidate>
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="At least 8 chars with upper, lower, number, and symbol."
          describedBy={password.length > 0 ? PASSWORD_STRENGTH_ID : undefined}
          autoComplete="new-password"
          required
        />
        <PasswordStrengthMeter password={password} id={PASSWORD_STRENGTH_ID} />
        <Input
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          autoComplete="new-password"
          required
        />
        <ErrorBubble variant="banner" message={serverError} />
        <Button type="submit" disabled={submitting} className={styles.submit}>
          {submitting ? 'Please wait…' : 'Reset password'}
        </Button>
      </form>
    </Card>
  );
}
