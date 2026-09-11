'use client';

import { useCallback, useEffect, useState } from 'react';
import DevShell from '../DevShell';
import { useDevGuard } from '../useDevGuard';
import Card from '@/components/Card';
import Button from '@/components/Button';
import ErrorBubble from '@/components/ErrorBubble';
import { authFetch } from '@/lib/authFetch';
import styles from '../primary/DevPrimary.module.css';

interface PatientAccount {
  id: string;
  email: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

/**
 * Item 6: patient account management — search, then revoke / reactivate /
 * reset-password. Any developer (primary or secondary), fully audit-logged.
 * Mirrors DevInstitutionsClient's tertiary-account UI, minus account
 * creation (patients self-register at /signup, devs don't create these).
 * Deliberately does NOT show or let a dev touch biodata — see the doc
 * comment on /api/dev/patients for why that's out of scope here.
 */
export default function DevPatientsClient() {
  const { loading, dev } = useDevGuard();
  const [accounts, setAccounts] = useState<PatientAccount[]>([]);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (query: string) => {
      setSearching(true);
      const res = await authFetch(
        `/api/dev/patients?limit=50${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''}`,
        undefined,
        { onUnauthenticated: setError },
      );
      setSearching(false);
      if (res.status === 401) return;
      if (res.ok) setAccounts((await res.json()).accounts ?? []);
    },
    [],
  );

  useEffect(() => {
    if (!loading) search('');
  }, [loading, search]);

  async function accountAction(id: string, action: 'revoke' | 'reactivate' | 'reset_password') {
    setError(null);
    setTempPassword(null);
    const res = await authFetch(
      '/api/dev/patients',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action }),
      },
      { onUnauthenticated: setError },
    );
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Could not update account.');
      return;
    }
    if (data.temp_password) setTempPassword(data.temp_password);
    search(q);
  }

  if (loading) {
    return (
      <DevShell title="Patients" showNav={false}>
        <p>Loading…</p>
      </DevShell>
    );
  }

  return (
    <DevShell title="Patient accounts" dev={dev}>
      <section className={styles.section}>
        <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>
          Revoke, reactivate, or reset the password on a patient&apos;s account. This does not show or edit their
          medical record — that stays private to the patient.
        </p>
        <Card variant="plain" style={{ marginBottom: '1rem' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search(q);
            }}
            className={styles.createForm}
          >
            <input
              type="text"
              placeholder="Search by email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search patient accounts by email"
              style={{
                flex: 1,
                minWidth: '200px',
                fontSize: '1rem',
                padding: '0.5rem 0.7rem',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
              }}
            />
            <Button type="submit" disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </Button>
          </form>
          <ErrorBubble message={error} />
          {tempPassword && (
            <p className={styles.temp}>
              Password (shown once, save it now): <code>{tempPassword}</code>
            </p>
          )}
        </Card>

        <ul className={styles.accountList}>
          {accounts.map((a) => (
            <li key={a.id} className={styles.account}>
              <div>
                <strong>{a.email}</strong>
                {!a.is_active && <span className={styles.revoked}>revoked</span>}
              </div>
              <div className={styles.accountActions}>
                {a.is_active ? (
                  <button type="button" onClick={() => accountAction(a.id, 'revoke')}>
                    Revoke
                  </button>
                ) : (
                  <button type="button" onClick={() => accountAction(a.id, 'reactivate')}>
                    Reactivate
                  </button>
                )}
                <button type="button" onClick={() => accountAction(a.id, 'reset_password')}>
                  Reset password
                </button>
              </div>
            </li>
          ))}
          {accounts.length === 0 && <li className={styles.account}>No matching patient accounts.</li>}
        </ul>
      </section>
    </DevShell>
  );
}
