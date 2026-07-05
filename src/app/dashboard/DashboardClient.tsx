'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Calendar from '@/components/Calendar';
import BioDataForm from '@/components/BioDataForm';
import IHNCodeDisplay from '@/components/IHNCodeDisplay';
import type { ProfileLayer, BiodataLayer } from '@/types';
import styles from './Dashboard.module.css';

interface BiodataResponse {
  user_id: string;
  profile_layer: ProfileLayer;
  biodata_layer: BiodataLayer;
  ihn_code: string;
}

export default function DashboardClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BiodataResponse | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

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

  async function handleSave(profile: ProfileLayer, biodata: BiodataLayer) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/biodata/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile_layer: profile, biodata_layer: biodata }),
      });
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

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
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

        <section className={styles.mainGrid}>
          <Card as="section">
            <h2 className={styles.heading}>Recent</h2>
            <p className={styles.muted}>No recent activity yet.</p>
          </Card>
          <Card as="section">
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

        <h2 className={styles.sectionTitle}>Biodata Farm</h2>
        {data && <IHNCodeDisplay code={data.ihn_code} />}
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
