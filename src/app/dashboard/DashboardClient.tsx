'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Calendar from '@/components/Calendar';
import BioDataForm from '@/components/BioDataForm';
import IHNCodeDisplay from '@/components/IHNCodeDisplay';
import SharingPrefsPanel from '@/components/SharingPrefsPanel';
import { DEFAULT_SHARING_PREFS } from '@/lib/sharing-prefs';
import { authFetch } from '@/lib/authFetch';
import type { ProfileLayer, BiodataLayer, SharingPrefs } from '@/types';
import styles from './Dashboard.module.css';

interface BiodataResponse {
  user_id: string;
  profile_layer: ProfileLayer;
  biodata_layer: BiodataLayer;
  ihn_code: string;
  /** Worklist #23 — default-deny sharing preferences for the IHN cross-user
   * read path; always present/normalized by the API. */
  sharing_prefs?: SharingPrefs;
  /** Worklist #18: non-blocking nudge only — an unverified account can still
   * use the full dashboard/biodata farm. */
  email_verified?: boolean;
}

export default function DashboardClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BiodataResponse | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [showIhnNotice, setShowIhnNotice] = useState(false);
  const [sharingSaving, setSharingSaving] = useState(false);

  // Initial page load's own session check — already correctly redirects to
  // /login on a 401, so this one stays a plain fetch (not authFetch, which is
  // for the ACTION calls below that fire after the page has already loaded).
  useEffect(() => {
    let active = true;
    fetch('/api/biodata/me')
      .then((res) => {
        if (res.status === 401) {
          router.replace('/login');
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((d: BiodataResponse | null) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [router]);

  // Worklist #19: warn the user about the IHN code "upon signing in" — shown
  // as a one-time dashboard nudge (mirrors the #18 email-verification banner
  // pattern) rather than an every-visit banner, since IHNCodeDisplay already
  // shows a persistent explainer below. Tracked in localStorage per user id
  // so it only ever appears once per browser (dismissible), not gated on a
  // real "first login" server flag — a lightweight interpretation of "warn on
  // signing in", not a hard requirement to add new schema for it.
  useEffect(() => {
    if (!data?.user_id || typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(`re_ihn_notice_seen_${data.user_id}`);
    if (!seen) setShowIhnNotice(true);
  }, [data?.user_id]);

  function dismissIhnNotice() {
    if (data?.user_id && typeof window !== 'undefined') {
      window.localStorage.setItem(`re_ihn_notice_seen_${data.user_id}`, '1');
    }
    setShowIhnNotice(false);
  }

  async function handleSave(profile: ProfileLayer, biodata: BiodataLayer) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await authFetch(
        '/api/biodata/me',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ profile_layer: profile, biodata_layer: biodata }),
        },
        { onUnauthenticated: setSaveError },
      );
      if (res.status === 401) return;
      const body = await res.json();
      if (!res.ok) {
        setSaveError(body.error ?? 'Could not save.');
        return;
      }
      setData((prev) =>
        prev
          ? { ...prev, profile_layer: body.profile_layer, biodata_layer: body.biodata_layer }
          : prev,
      );
      setSavedAt(Date.now());
    } catch {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSharingPrefs(next: SharingPrefs) {
    setSharingSaving(true);
    try {
      const res = await authFetch(
        '/api/biodata/me',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sharing_prefs: next }),
        },
        { onUnauthenticated: setSaveError },
      );
      if (res.status === 401) return;
      const body = await res.json();
      if (res.ok) {
        setData((prev) => (prev ? { ...prev, sharing_prefs: body.sharing_prefs } : prev));
      }
    } finally {
      setSharingSaving(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
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

  if (loading) {
    return (
      <Layout page="dashboard">
        <div className="page-container">
          <p>Loading…</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout page="dashboard">
      <div className={styles.wrap}>
        <div className={styles.topRow}>
          <h1 className={styles.title}>Dashboard</h1>
          <Button variant="ghost" onClick={logout}>
            Log out
          </Button>
        </div>

        {data && (
          <p className={styles.saved} style={{ marginTop: '-0.5rem' }}>
            Signed in as {data.profile_layer.email ?? '—'}
          </p>
        )}

        {data && data.email_verified === false && (
          <Card variant="plain" className={styles.verifyBanner} role="status">
            <p>
              Please verify your email address — check your inbox for a confirmation link we sent
              when you signed up.
            </p>
          </Card>
        )}

        {showIhnNotice && (
          <Card variant="plain" className={styles.ihnBanner} role="status">
            <p>
              A quick heads-up: your <strong>IHN access code</strong> below is a static emergency
              key that never changes. Keep it private and only share it with people you trust to
              view your medical information.
            </p>
            <Button variant="ghost" onClick={dismissIhnNotice}>
              Got it
            </Button>
          </Card>
        )}

        <section className={styles.account}>
          <h2 className={styles.sectionTitle}>My account</h2>
          <Card variant="plain">
            <form onSubmit={changePassword}>
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
            {pwError && <p style={{ color: 'var(--color-red)', fontSize: '0.85rem', marginTop: '0.75rem' }}>{pwError}</p>}
            {pwSuccess && <p style={{ color: 'var(--color-green)', fontSize: '0.85rem', marginTop: '0.75rem' }}>Password changed. Your other sessions were signed out.</p>}
          </Card>
        </section>

        <section className={styles.mainGrid}>
          <Card variant="plain" as="section">
            <h2 className={styles.heading}>Recent</h2>
            <p className={styles.muted}>No recent activity yet.</p>
          </Card>
          <Card variant="plain" as="section">
            <div className={styles.calHeader}>
              <h2 className={styles.heading}>Calendar</h2>
              <Button variant="ghost" onClick={() => setCalendarOpen((o) => !o)}>
                {calendarOpen ? 'Collapse' : 'Expand'}
              </Button>
            </div>
            {calendarOpen ? (
              <Calendar />
            ) : (
              <p className={styles.muted}>Expand to view your calendar.</p>
            )}
          </Card>
        </section>

        <h2 className={styles.sectionTitle}>Biodata</h2>
        {data && <IHNCodeDisplay code={data.ihn_code} />}
        {data && (
          <SharingPrefsPanel
            value={data.sharing_prefs ?? DEFAULT_SHARING_PREFS}
            onSave={handleSaveSharingPrefs}
            saving={sharingSaving}
          />
        )}
        {savedAt && (
          <p className={styles.saved} role="status">
            Saved.
          </p>
        )}
        {data && (
          <BioDataForm
            initialProfile={data.profile_layer}
            initialBiodata={data.biodata_layer}
            onSave={handleSave}
            saving={saving}
            saveError={saveError}
          />
        )}
      </div>
    </Layout>
  );
}
