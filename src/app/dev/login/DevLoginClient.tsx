'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DevShell from '../DevShell';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Card from '@/components/Card';

export default function DevLoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/dev/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Login failed.');
        return;
      }
      router.push('/dev/dashboard');
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DevShell title="Developer Login" showNav={false}>
      <Card style={{ maxWidth: 380 }}>
        <form onSubmit={onSubmit}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && (
            <p role="alert" style={{ color: 'var(--color-red)', fontSize: '0.85rem' }}>
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Please wait…' : 'Log in'}
          </Button>
        </form>
      </Card>
    </DevShell>
  );
}
