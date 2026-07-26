'use client';

import { useState } from 'react';
import Link from 'next/link';
import Input from './Input';
import Button from './Button';
import Card from './Card';
import { isValidEmail } from '@/lib/validation';
import styles from './LoginForm.module.css';

/**
 * Forgot-password request form (worklist #19). Always shows the same generic
 * confirmation message after submit, regardless of whether the email exists
 * — mirrors the enumeration-safe contract of POST /api/auth/forgot-password
 * (the server always returns the same message; this form just displays it
 * rather than branching on any client-visible signal of account existence).
 */
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const GENERIC_MESSAGE = "If that email address has an account, we've sent a password reset link.";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Still show the generic confirmation — a network hiccup here must not
      // reveal anything different than a normal response would.
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <Card className={styles.card}>
        <h1 className={styles.title}>Check your email</h1>
        <p className={styles.subtitle}>{GENERIC_MESSAGE}</p>
        <p className={styles.backLink}>
          <Link href="/login">Back to log in</Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className={styles.card}>
      <h1 className={styles.title}>Forgot password?</h1>
      <p className={styles.subtitle}>
        Enter the email address on your account and we&apos;ll send you a link to reset your
        password.
      </p>
      <form onSubmit={onSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error ?? undefined}
          autoComplete="email"
          required
        />
        <Button type="submit" disabled={submitting} className={styles.submit}>
          {submitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className={styles.backLink}>
        <Link href="/login">Back to log in</Link>
      </p>
    </Card>
  );
}
