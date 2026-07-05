'use client';

import { useCallback, useEffect, useState } from 'react';
import DevShell from '../DevShell';
import { useDevGuard } from '../useDevGuard';
import SuggestionsBoard from '@/components/SuggestionsBoard';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Dropdown from '@/components/Dropdown';
import Button from '@/components/Button';
import styles from './DevPrimary.module.css';

interface DevAccount {
  id: string;
  email: string;
  access_level: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  user_id: string | null;
  action_type: string;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

export default function DevPrimaryClient() {
  const { loading, dev } = useDevGuard();
  const [accounts, setAccounts] = useState<DevAccount[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newLevel, setNewLevel] = useState('first_aid_editor');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    const res = await fetch('/api/dev/accounts');
    if (res.ok) setAccounts((await res.json()).accounts ?? []);
  }, []);

  const loadLogs = useCallback(async () => {
    const res = await fetch('/api/dev/audit-logs?limit=50');
    if (res.ok) setLogs((await res.json()).logs ?? []);
  }, []);

  useEffect(() => {
    if (!loading && dev?.is_admin) {
      loadAccounts();
      loadLogs();
    }
  }, [loading, dev, loadAccounts, loadLogs]);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setAccountError(null);
    setTempPassword(null);
    const res = await fetch('/api/dev/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: newEmail, access_level: newLevel }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAccountError(data.error ?? 'Could not create account.');
      return;
    }
    setTempPassword(data.temp_password);
    setNewEmail('');
    loadAccounts();
  }

  async function accountAction(id: string, action: 'revoke' | 'reactivate' | 'reset_password') {
    const res = await fetch('/api/dev/accounts', {
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
      <DevShell title="Primary Dev Admin" showNav={false}>
        <p>Loading…</p>
      </DevShell>
    );
  }

  if (!dev?.is_admin) {
    return (
      <DevShell title="Primary Dev Admin">
        <p>You do not have admin access.</p>
      </DevShell>
    );
  }

  return (
    <DevShell title="Primary Dev Admin">
      <section className={styles.section}>
        <h2>Developer accounts</h2>
        <Card style={{ marginBottom: '1rem' }}>
          <form onSubmit={createAccount} className={styles.createForm}>
            <Input
              label="New developer email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <Dropdown
              label="Access level"
              options={[
                { value: 'first_aid_editor', label: 'First-aid editor' },
                { value: 'admin', label: 'Admin' },
              ]}
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value)}
            />
            <Button type="submit">Create account</Button>
          </form>
          {accountError && <p className={styles.error}>{accountError}</p>}
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
                <span className={styles.badge}>{a.access_level}</span>
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
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Suggestions dashboard</h2>
        <SuggestionsBoard />
      </section>

      <section className={styles.section}>
        <h2>Audit log</h2>
        <div className={styles.logTable}>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Resource</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.created_at).toLocaleString()}</td>
                  <td>{l.action_type}</td>
                  <td>{[l.resource_type, l.resource_id].filter(Boolean).join(' / ')}</td>
                  <td className={styles.mono}>{l.user_id?.slice(0, 8) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </DevShell>
  );
}
