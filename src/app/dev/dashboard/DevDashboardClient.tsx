'use client';

import Link from 'next/link';
import DevShell from '../DevShell';
import { useDevGuard } from '../useDevGuard';
import Card from '@/components/Card';

export default function DevDashboardClient() {
  const { loading, dev } = useDevGuard();

  if (loading) {
    return (
      <DevShell title="Developer Dashboard" showNav={false}>
        <p>Loading…</p>
      </DevShell>
    );
  }

  return (
    <DevShell title="Developer Dashboard">
      <p style={{ color: 'var(--color-muted)' }}>
        Signed in as {dev?.email} ({dev?.access_level}).
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginTop: '1rem',
        }}
      >
        <Card>
          <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>First Aid catalog</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
            Create, edit and delete first-aid entries.
          </p>
          <Link href="/dev/first-aid">Manage entries →</Link>
        </Card>
        <Card>
          <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>Institutions</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
            Provision and manage hospital (tertiary) staff accounts.
          </p>
          <Link href="/dev/institutions">Manage accounts →</Link>
        </Card>
        {dev?.is_primary && (
          <Card>
            <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>Admin</h2>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
              Developer accounts, audit logs, suggestions.
            </p>
            <Link href="/dev/primary">Open admin →</Link>
          </Card>
        )}
      </div>
    </DevShell>
  );
}
