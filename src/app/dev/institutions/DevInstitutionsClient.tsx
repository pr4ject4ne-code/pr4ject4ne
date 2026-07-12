'use client';

import { useCallback, useEffect, useState } from 'react';
import DevShell from '../DevShell';
import { useDevGuard } from '../useDevGuard';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Dropdown from '@/components/Dropdown';
import Button from '@/components/Button';
import styles from '../primary/DevPrimary.module.css';

interface TertiaryAccount {
  id: string;
  email: string;
  hospital_id: string | null;
  hospital_name: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

interface HospitalOption {
  id: string;
  name: string;
}

/**
 * Institution (tertiary) account management — available to any developer
 * (primary + secondary). Provisions hospital_staff accounts against a hospital,
 * lists them, and revokes/reactivates/resets. Uses /api/dev/tertiary.
 */
export default function DevInstitutionsClient() {
  const { loading, dev } = useDevGuard();
  const [accounts, setAccounts] = useState<TertiaryAccount[]>([]);
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newHospitalId, setNewHospitalId] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    const res = await fetch('/api/dev/tertiary?limit=200');
    if (res.ok) setAccounts((await res.json()).accounts ?? []);
  }, []);

  const loadHospitals = useCallback(async () => {
    const res = await fetch('/api/hospitals?limit=200');
    if (res.ok) {
      const list = ((await res.json()).hospitals ?? []) as HospitalOption[];
      setHospitals(list);
      const first = list[0];
      if (first) setNewHospitalId((prev) => prev || first.id);
    }
  }, []);

  useEffect(() => {
    if (!loading && dev) {
      loadAccounts();
      loadHospitals();
    }
  }, [loading, dev, loadAccounts, loadHospitals]);

  async function createTertiary(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTempPassword(null);
    const res = await fetch('/api/dev/tertiary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: newEmail, hospital_id: newHospitalId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Could not create account.');
      return;
    }
    setTempPassword(data.temp_password);
    setNewEmail('');
    loadAccounts();
  }

  async function accountAction(id: string, action: 'revoke' | 'reactivate' | 'reset_password') {
    const res = await fetch('/api/dev/tertiary', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    const data = await res.json();
    if (res.ok && data.temp_password) setTempPassword(data.temp_password);
    loadAccounts();
  }

  if (loading) {
    return (
      <DevShell title="Institutions" showNav={false}>
        <p>Loading…</p>
      </DevShell>
    );
  }

  return (
    <DevShell title="Institution accounts">
      <section className={styles.section}>
        <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>
          Provision a <strong>tertiary</strong> (institution) account. The staff member
          signs in at <code>/login</code> and can edit only that hospital&apos;s listing.
        </p>
        <Card style={{ marginBottom: '1rem' }}>
          <form onSubmit={createTertiary} className={styles.createForm}>
            <Input
              label="Staff email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <Dropdown
              label="Hospital"
              options={hospitals.map((h) => ({ value: h.id, label: h.name }))}
              value={newHospitalId}
              onChange={(e) => setNewHospitalId(e.target.value)}
            />
            <Button type="submit" disabled={!newHospitalId}>
              Create account
            </Button>
          </form>
          {error && <p className={styles.error}>{error}</p>}
          {tempPassword && (
            <p className={styles.temp}>
              Temporary password (shown once — save it now): <code>{tempPassword}</code>
            </p>
          )}
        </Card>

        <ul className={styles.accountList}>
          {accounts.map((a) => (
            <li key={a.id} className={styles.account}>
              <div>
                <strong>{a.email}</strong>
                <span className={styles.badge}>{a.hospital_name ?? 'unknown hospital'}</span>
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
          {accounts.length === 0 && <li className={styles.account}>No institution accounts yet.</li>}
        </ul>
      </section>
    </DevShell>
  );
}
