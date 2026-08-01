'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DevShell from '../DevShell';
import { useDevGuard } from '../useDevGuard';
import SuggestionsBoard from '@/components/SuggestionsBoard';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Dropdown from '@/components/Dropdown';
import Button from '@/components/Button';
import ErrorBubble from '@/components/ErrorBubble';
import { authFetch } from '@/lib/authFetch';
import styles from './DevPrimary.module.css';

type AccountAction = 'suspend' | 'reactivate' | 'revoke' | 'promote' | 'reset_password' | 'reset_totp';

interface DevAccount {
  id: string;
  email: string;
  access_level: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  totp_enabled: boolean;
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

  // --- Two-factor authentication (self-serve opt-in, primary accounts only) ---
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [enrollUri, setEnrollUri] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

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

  useEffect(() => {
    if (dev) setTotpEnabled(!!dev.totp_enabled);
  }, [dev]);

  // Render the pending enrollment's otpauth URI as a QR code client-side —
  // same `qrcode` package + pattern used for the IHN code (IHNCodeDisplay.tsx).
  useEffect(() => {
    if (!enrollUri || !qrCanvasRef.current) return;
    let cancelled = false;
    import('qrcode')
      .then((QRCode) => {
        if (cancelled || !qrCanvasRef.current) return;
        return QRCode.toCanvas(qrCanvasRef.current, enrollUri, { width: 180, margin: 1 });
      })
      .catch(() => {
        // QR generation is a nice-to-have — the secret text fallback below
        // always works for manual entry if it fails silently.
      });
    return () => {
      cancelled = true;
    };
  }, [enrollUri]);

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

  async function startTotpEnroll() {
    setEnrollError(null);
    setRecoveryCodes(null);
    const res = await authFetch('/api/dev/totp/enroll', { method: 'POST' }, { onUnauthenticated: setEnrollError });
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok) {
      setEnrollError(data.error ?? 'Could not start enrollment.');
      return;
    }
    setEnrollSecret(data.secret);
    setEnrollUri(data.otpauth_uri);
  }

  async function submitTotpEnrollCode(e: React.FormEvent) {
    e.preventDefault();
    setEnrollError(null);
    const res = await authFetch(
      '/api/dev/totp/verify-enroll',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: enrollCode }),
      },
      { onUnauthenticated: setEnrollError },
    );
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok) {
      setEnrollError(data.error ?? 'Invalid code.');
      return;
    }
    setRecoveryCodes(data.recovery_codes);
    setEnrollSecret(null);
    setEnrollUri(null);
    setEnrollCode('');
    setTotpEnabled(true);
    loadAccounts();
  }

  async function submitTotpDisable(e: React.FormEvent) {
    e.preventDefault();
    setDisableError(null);
    const res = await authFetch(
      '/api/dev/totp/disable',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: disableCode }),
      },
      { onUnauthenticated: setDisableError },
    );
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok) {
      setDisableError(data.error ?? 'Could not disable two-factor authentication.');
      return;
    }
    setTotpEnabled(false);
    setDisableCode('');
    setRecoveryCodes(null);
    loadAccounts();
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
          <ErrorBubble message={pwError} />
          {pwSuccess && <p className={styles.temp}>Password changed. Your other sessions were signed out.</p>}
        </Card>
      </section>

      <section className={styles.section}>
        <h2>
          Two-factor authentication
          {totpEnabled && <span className={styles.statusBadgeOn}>enabled</span>}
        </h2>
        <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>
          Adds a second factor (an authenticator app code) to your own sign-in, since this account
          can revoke other developers and read every audit log. Opt-in — enabling it only affects
          your own account.
        </p>
        <Card variant="plain" style={{ marginBottom: '1rem' }}>
          {recoveryCodes ? (
            <>
              <p>
                <strong>Save these recovery codes now — they will not be shown again.</strong> Each
                one can be used once in place of a 6-digit code if you lose access to your
                authenticator app.
              </p>
              <div className={styles.recoveryCodes}>
                {recoveryCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <p className={styles.temp}>Two-factor authentication is now enabled on your account.</p>
            </>
          ) : totpEnabled ? (
            <form onSubmit={submitTotpDisable} className={styles.createForm}>
              <Input
                label="Current 6-digit code (or a recovery code)"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                required
              />
              <Button type="submit">Disable 2FA</Button>
              <ErrorBubble message={disableError} />
            </form>
          ) : enrollUri && enrollSecret ? (
            <>
              <div className={styles.totpQr}>
                <canvas ref={qrCanvasRef} aria-hidden="true" />
                <div>
                  <p>Scan this with your authenticator app, or enter the secret manually:</p>
                  <p className={styles.totpSecret}>{enrollSecret}</p>
                </div>
              </div>
              <form onSubmit={submitTotpEnrollCode} className={styles.createForm}>
                <Input
                  label="6-digit code from your app"
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value)}
                  required
                />
                <Button type="submit">Verify &amp; enable</Button>
              </form>
              <ErrorBubble message={enrollError} />
            </>
          ) : (
            <>
              <Button type="button" onClick={startTotpEnroll}>
                Enable 2FA
              </Button>
              <ErrorBubble message={enrollError} />
            </>
          )}
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
          <ErrorBubble message={accountError} />
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
                {a.totp_enabled && <span className={styles.statusBadgeOn}>2FA</span>}
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
                  <button type="button" onClick={() => accountAction(a.id, 'reset_totp')}>
                    Reset 2FA
                  </button>
                )}
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
