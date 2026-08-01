'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Input from './Input';
import Button from './Button';
import Card from './Card';
import PasswordStrengthMeter from './PasswordStrengthMeter';
import ErrorBubble from './ErrorBubble';
import { validatePasswordStrength, isValidEmail } from '@/lib/validation';
import { scrollToFirstInvalidField } from '@/lib/scrollToError';
import styles from './LoginForm.module.css';

type Mode = 'login' | 'signup';

const PASSWORD_STRENGTH_ID = 'signup-password-strength';

export default function LoginForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [ihn, setIhn] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

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
    if (!validate()) {
      scrollToFirstInvalidField(formRef.current);
      return;
    }
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
      if (mode === 'login' && data.mfa_required && data.challenge_token) {
        // Password step passed but this account requires a second factor —
        // switch to the code-entry step instead of routing anywhere yet.
        setMfaChallengeToken(data.challenge_token);
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

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaError(null);
    if (!mfaChallengeToken || !mfaCode) return;
    setMfaSubmitting(true);
    try {
      const res = await fetch('/api/auth/login/totp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challenge_token: mfaChallengeToken, code: mfaCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMfaError(data.error ?? 'Invalid code.');
        return;
      }
      // Same success routing as the primary login step above.
      router.push(data.redirect ?? '/dashboard');
    } catch {
      setMfaError('Network error. Please try again.');
    } finally {
      setMfaSubmitting(false);
    }
  }

  if (mfaChallengeToken) {
    return (
      <Card variant="plain" className={styles.card}>
        <h1 className={styles.title}>Two-factor authentication</h1>
        <p className={styles.subtitle}>
          {useRecoveryCode
            ? 'Enter one of your unused recovery codes.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
        <form onSubmit={submitMfa} noValidate>
          <Input
            label={useRecoveryCode ? 'Recovery code' : 'Authentication code'}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            inputMode={useRecoveryCode ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            autoFocus
            required
          />
          <ErrorBubble variant="banner" message={mfaError} />
          <Button type="submit" disabled={mfaSubmitting || !mfaCode} className={styles.submit}>
            {mfaSubmitting ? 'Verifying…' : 'Verify'}
          </Button>
        </form>
        <p className={styles.backLink}>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setUseRecoveryCode((v) => !v);
              setMfaCode('');
              setMfaError(null);
            }}
          >
            {useRecoveryCode ? 'Use an authenticator code instead' : 'Use a recovery code instead'}
          </button>
        </p>
      </Card>
    );
  }

  if (ihn) {
    return (
      <Card variant="plain" className={styles.card}>
        <h1 className={styles.title}>Account created</h1>
        <p>
          Your personal IHN access code is below. It is a{' '}
          <strong>stable emergency access key</strong> that stays the same until you choose to
          regenerate it. Save it somewhere safe and share it only with people you trust to access
          your biodata in an emergency.
        </p>
        <p className={styles.ihn}>{ihn}</p>
        <Button onClick={() => router.push('/dashboard')}>Continue to dashboard</Button>
      </Card>
    );
  }

  return (
    <Card variant="plain" className={styles.card}>
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

      <form ref={formRef} onSubmit={onSubmit} noValidate>
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
        {mode === 'signup' && (
          <PasswordStrengthMeter password={password} id={PASSWORD_STRENGTH_ID} />
        )}
        {mode === 'login' && (
          <p className={styles.forgot}>
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
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
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                aria-invalid={errors.agree ? true : undefined}
                aria-describedby={errors.agree ? 'signup-agree-error' : undefined}
              />
              <span>
                I agree to the <a href="/terms-and-conditions">Terms &amp; Conditions</a> and{' '}
                <a href="/privacy-policy">Privacy Policy</a>.
              </span>
            </label>
            <ErrorBubble as="span" variant="field" id="signup-agree-error" message={errors.agree} />
          </>
        )}

        <ErrorBubble variant="banner" message={serverError} />

        <Button type="submit" disabled={submitting} className={styles.submit}>
          {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
        </Button>
      </form>
    </Card>
  );
}
