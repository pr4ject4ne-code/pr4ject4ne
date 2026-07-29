'use client';

import { useCallback, useEffect, useState } from 'react';
import DevShell from '../DevShell';
import { useDevGuard } from '../useDevGuard';
import SuggestionsBoard from '@/components/SuggestionsBoard';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Dropdown from '@/components/Dropdown';
import Button from '@/components/Button';
import { authFetch } from '@/lib/authFetch';
import styles from './DevPrimary.module.css';

type AccountAction = 'suspend' | 'reactivate' | 'revoke' | 'promote' | 'reset_password';

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
  user_email: string | null;
  action_type: string;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

/** Groups audit rows by user (founder ask, 2026-07-29: "neatly organized
 * based on user, so each user, their own log") — each group keeps its rows
 * in the API's own most-recent-first order; groups themselves are ordered
 * by their most recent entry, so whoever has been active most recently
 * appears first. Rows with no user_id (system-level entries, e.g. a
 * rate_limited action logged before any session existed) are grouped under
 * a single "System / unknown" bucket rather than one bucket per null. */
function groupLogsByUser(logs: AuditRow[]): Array<{ key: string; label: string; rows: AuditRow[] }> {
  const groups = new Map<string, { key: string; label: string; rows: AuditRow[] }>();
  for (const row of logs) {
    const key = row.user_id ?? 'system';
    const label = row.user_id ? (row.user_email ?? row.user_id.slice(0, 8)) : 'System / unknown';
    if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  // logs is already created_at DESC, so each group's first row is its most
  // recent — sort groups by that to surface the most recently active user first.
  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.rows[0]!.created_at).getTime() - new Date(a.rows[0]!.created_at).getTime(),
  );
}

export default function DevPrimaryClient() {
  const { loading, dev } = useDevGuard();
  const [accounts, setAccounts] = useState<DevAccount[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newLevel, setNewLevel] = useState<'primary' | 'secondary'>('secondary');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const loadAccounts = useCallback(async () => {
    const res = await authFetch('/api/dev/accounts', undefined, { onUnauthenticated: setAccountError });
    if (res.status === 401) return;
    if (res.ok) setAccounts((await res.json()).accounts ?? []);
  }, []);

  const loadLogs = useCallback(async () => {
    const res = await authFetch('/api/dev/audit-logs?limit=50', undefined, { onUnauthenticated: setAccountError });
    if (res.status === 401) return;
    if (res.ok) setLogs((await res.json()).logs ?? []);
  }, []);

  useEffect(() => {
    if (!loading && dev?.is_primary) {
      loadAccounts();
      loadLogs();
    }
  }, [loading, dev, loadAccounts, loadLogs]);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setAccountError(null);
    setTempPassword(null);
    const res = await authFetch(
      '/api/dev/accounts',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: newEmail, access_level: newLevel }),
      },
      { onUnauthenticated: setAccountError },
    );
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok) {
      setAccountError(data.error ?? 'Could not create account.');
      return;
    }
    setTempPassword(data.temp_password);
    setNewEmail('');
    loadAccounts();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    const res = await authFetch(
      '/api/account/password',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      },
      { onUnauthenticated: setPwError },
    );
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok) {
      setPwError(data.error ?? 'Could not change password.');
      return;
    }
    setPwSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
  }

  async function accountAction(id: string, action: AccountAction, level?: 'primary' | 'secondary') {
    if (action === 'revoke' && !window.confirm('Permanently delete this developer account? This cannot be undone.')) {
      return;
    }
    setAccountError(null);
    const res = await authFetch(
      '/api/dev/accounts',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action, ...(level ? { level } : {}) }),
      },
      { onUnauthenticated: setAccountError },
    );
    if (res.status === 401) return;
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

  if (!dev?.is_primary) {
    return (
      <DevShell title="Primary Dev Admin" dev={dev}>
        <p>You do not have admin access.</p>
      </DevShell>
    );
  }

  return (
    <DevShell title="Primary Dev Admin" dev={dev}>
      <section className={styles.section}>
        <h2>My account</h2>
        <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>
          Change your own sign-in password. Email ({dev.email}) cannot be changed here.
        </p>
        <Card variant="plain" style={{ marginBottom: '1rem' }}>
          <form onSubmit={changePassword} className={styles.createForm}>
            <Input
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <Button type="submit">Change password</Button>
          </form>
          {pwError && <p className={styles.error}>{pwError}</p>}
          {pwSuccess && <p className={styles.temp}>Password changed. Your other sessions were signed out.</p>}
        </Card>
      </section>

      <section className={styles.section}>
        <h2>Developer accounts</h2>
        <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>
          As a <strong>level-1 (primary)</strong> admin you can create another primary or a
          secondary developer, and inspect, suspend, promote, revoke, or reset any developer
          below. Only a level-1 admin can manage other devs.
        </p>
        <Card variant="plain" style={{ marginBottom: '1rem' }}>
          <form onSubmit={createAccount} className={styles.createForm}>
            <Input
              label="New developer email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <Dropdown
              label="Level"
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value as 'primary' | 'secondary')}
              options={[
                { value: 'secondary', label: 'Secondary (operational)' },
                { value: 'primary', label: 'Primary (level-1 admin)' },
              ]}
            />
            <Button type="submit">Create developer</Button>
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
                {!a.is_active && <span className={styles.revoked}>suspended</span>}
              </div>
              <div className={styles.accountActions}>
                {a.id !== dev.id && a.is_active ? (
                  <button type="button" onClick={() => accountAction(a.id, 'suspend')}>
                    Suspend
                  </button>
                ) : a.id !== dev.id ? (
                  <button type="button" onClick={() => accountAction(a.id, 'reactivate')}>
                    Reactivate
                  </button>
                ) : null}
                {a.id !== dev.id && a.access_level === 'secondary' && (
                  <button type="button" onClick={() => accountAction(a.id, 'promote', 'primary')}>
                    Promote to primary
                  </button>
                )}
                {a.id !== dev.id && a.access_level === 'primary' && (
                  <button type="button" onClick={() => accountAction(a.id, 'promote', 'secondary')}>
                    Demote to secondary
                  </button>
                )}
                <button type="button" onClick={() => accountAction(a.id, 'reset_password')}>
                  Reset password
                </button>
                {a.id !== dev.id && (
                  <button
                    type="button"
                    className={styles.revokeBtn}
                    onClick={() => accountAction(a.id, 'revoke')}
                  >
                    Revoke
                  </button>
                )}
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
        <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>
          Grouped by user — most recently active first.
        </p>
        {groupLogsByUser(logs).map((group) => (
          <div key={group.key} className={styles.logUserGroup}>
            <h3 className={styles.logUserHeading}>
              {group.label} <span className={styles.badge}>{group.rows.length}</span>
            </h3>
            <div className={styles.logTable}>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Resource</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((l) => (
                    <tr key={l.id}>
                      <td>{new Date(l.created_at).toLocaleString()}</td>
                      <td>{l.action_type}</td>
                      <td>{[l.resource_type, l.resource_id].filter(Boolean).join(' / ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {logs.length === 0 && <p className={styles.mono}>No audit log entries yet.</p>}
      </section>
    </DevShell>
  );
}
