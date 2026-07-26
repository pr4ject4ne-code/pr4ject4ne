'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Input from './Input';
import Button from './Button';
import Card from './Card';
import { validatePasswordStrength, isValidEmail, getPasswordChecks } from '@/lib/validation';
import styles from './LoginForm.module.css';

type Mode = 'login' | 'signup';
type StrengthLevel = 'weak' | 'medium' | 'strong';

const STRENGTH_LABEL: Record<StrengthLevel, string> = {
  weak: 'Weak',
  medium: 'Fair',
  strong: 'Strong',
};

const PASSWORD_STRENGTH_ID = 'signup-password-strength';

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [ihn, setIhn] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordChecks = mode === 'signup' ? getPasswordChecks(password) : [];
  const metCount = passwordChecks.filter((check) => check.met).length;
  const strengthLevel: StrengthLevel = metCount <= 1 ? 'weak' : metCount <= 3 ? 'medium' : 'strong';

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!isValidEmail(email)) next.email = 'Enter a valid email address.';
    if (mode === 'signup') {
      const strength = validatePasswordStrength(password);
      if (!strength.ok) next.password = strength.reason!;
      if (password !== confirm) next.confirm = 'Passwords do not match.';
      if (!agree) next.agree = 'You must accept the Terms to continue.';
    } else if (!password) {
      next.password = 'Enter your password.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? 'Something went wrong.');
        return;
      }
      if (mode === 'signup' && data.ihn_code) {
        // Show the IHN once, then continue to the dashboard.
        setIhn(data.ihn_code);
        return;
      }
      // Unified login routes by account type: patients → dashboard, developers →
      // dev portal, hospital staff → institution portal.
      router.push(data.redirect ?? '/dashboard');
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (ihn) {
    return (
      <Card className={styles.card}>
        <h1 className={styles.title}>Account created</h1>
        <p>
          Your personal IHN access code is below. It is a{' '}
          <strong>static emergency access key</strong> — it never changes. Save it somewhere safe
          and share it only with people you trust to access your biodata in an emergency.
        </p>
        <p className={styles.ihn}>{ihn}</p>
        <Button onClick={() => router.push('/dashboard')}>Continue to dashboard</Button>
      </Card>
    );
  }

  return (
    <Card className={styles.card}>
      <h1 className={styles.title}>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
      <p className={styles.subtitle}>
        {mode === 'signup'
          ? 'Save your biodata and reach care faster.'
          : 'Sign in to your Racoon Eye account.'}
      </p>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={mode === 'login' ? styles.activeTab : ''}
          onClick={() => setMode('login')}
        >
          Log in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          className={mode === 'signup' ? styles.activeTab : ''}
          onClick={() => setMode('signup')}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoComplete="email"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={
            mode === 'signup'
              ? 'At least 8 chars with upper, lower, number, and symbol.'
              : undefined
          }
          describedBy={mode === 'signup' && password.length > 0 ? PASSWORD_STRENGTH_ID : undefined}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
        />
        {mode === 'signup' && password.length > 0 && (
          <div className={styles.strength} id={PASSWORD_STRENGTH_ID}>
            <div className={styles.strengthBar} aria-hidden="true">
              {passwordChecks.map((check, i) => (
                <span
                  key={check.key}
                  className={`${styles.strengthPill} ${
                    i < metCount ? styles[`strength-${strengthLevel}`] : ''
                  }`}
                />
              ))}
            </div>
            <p className={styles.strengthLabel} aria-live="polite">
              Password strength: {STRENGTH_LABEL[strengthLevel]}
            </p>
            <ul className={styles.strengthChecklist}>
              {passwordChecks.map((check) => (
                <li
                  key={check.key}
                  className={check.met ? styles.checkMet : styles.checkUnmet}
                >
                  <span aria-hidden="true">{check.met ? '✓' : '○'}</span> {check.label}
                </li>
              ))}
            </ul>
          </div>
        )}
        {mode === 'signup' && (
          <>
            <Input
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={errors.confirm}
              autoComplete="new-password"
              required
            />
            <label className={styles.agree}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I agree to the <a href="/terms-and-conditions">Terms &amp; Conditions</a> and{' '}
                <a href="/privacy-policy">Privacy Policy</a>.
              </span>
            </label>
            {errors.agree && (
              <p role="alert" className={styles.error}>
                {errors.agree}
              </p>
            )}
          </>
        )}

        {serverError && (
          <p role="alert" className={styles.error}>
            {serverError}
          </p>
        )}

        <Button type="submit" disabled={submitting} className={styles.submit}>
          {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
        </Button>
      </form>
    </Card>
  );
}
