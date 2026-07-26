'use client';

import { useCallback, useEffect, useState } from 'react';
import DevShell from '../DevShell';
import { useDevGuard } from '../useDevGuard';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Dropdown from '@/components/Dropdown';
import Button from '@/components/Button';
import type { ConsentStatus } from '@/types';
import styles from '../primary/DevPrimary.module.css';

interface DoctorRow {
  id: string;
  name: string;
  specialty: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  hospital_id: string;
  hospital_name: string;
  consent_id: string | null;
  consent_status: ConsentStatus | null;
  contacted_via: string | null;
  denial_reason: string | null;
  decided_at: string | null;
  consent_recorded_at: string | null;
}

const STATUS_LABEL: Record<ConsentStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
};

/**
 * Doctor consent recording (worklist #30) — any developer (primary or
 * secondary) searches a doctor, sees their current consent status (derived
 * from the most recent doctor_consent_records row, or "not yet contacted" if
 * none exists — the default-deny state per migration 014), and records the
 * outcome of an out-of-band contact (phone/email, outside this app).
 */
export default function DevDoctorConsentClient() {
  const { loading, dev } = useDevGuard();
  const [query, setQuery] = useState('');
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [contactedVia, setContactedVia] = useState('');
  const [status, setStatus] = useState<ConsentStatus>('approved');
  const [denialReason, setDenialReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadDoctors = useCallback(async (q: string) => {
    const res = await fetch(`/api/dev/doctor-consent?q=${encodeURIComponent(q)}&limit=50`);
    if (res.ok) setDoctors((await res.json()).doctors ?? []);
  }, []);

  useEffect(() => {
    if (!loading && dev) loadDoctors('');
  }, [loading, dev, loadDoctors]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    loadDoctors(query);
  }

  async function recordConsent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!selected) {
      setError('Select a doctor first.');
      return;
    }
    const res = await fetch('/api/dev/doctor-consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        doctor_id: selected,
        consent_status: status,
        contacted_via: contactedVia,
        denial_reason: status === 'denied' ? denialReason : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Could not record consent.');
      return;
    }
    setMessage('Consent outcome recorded.');
    setContactedVia('');
    setDenialReason('');
    loadDoctors(query);
  }

  if (loading) {
    return (
      <DevShell title="Doctor consent" showNav={false}>
        <p>Loading…</p>
      </DevShell>
    );
  }

  return (
    <DevShell title="Doctor consent">
      <section className={styles.section}>
        <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>
          Record the outcome of contacting a doctor <strong>out-of-band</strong> (phone/email,
          outside this app) about whether they consent to their name/contact appearing in a
          generated report. A doctor with no record here is treated as <strong>not consented</strong>{' '}
          — reports never attribute a field to a doctor without an approved record.
        </p>

        <Card style={{ marginBottom: '1rem' }}>
          <form onSubmit={search} className={styles.createForm}>
            <Input
              label="Search doctor or hospital"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Ada Obi or Memfys"
            />
            <Button type="submit">Search</Button>
          </form>
        </Card>

        <ul className={styles.accountList}>
          {doctors.map((d) => (
            <li key={d.id} className={styles.account}>
              <div>
                <strong>{d.name}</strong>
                <span className={styles.badge}>{d.hospital_name}</span>
                {d.consent_status ? (
                  <span
                    className={d.consent_status === 'denied' ? styles.revoked : styles.badge}
                    style={d.consent_status === 'approved' ? { background: 'var(--color-green)', color: '#fff' } : undefined}
                  >
                    {STATUS_LABEL[d.consent_status]}
                  </span>
                ) : (
                  <span className={styles.revoked}>Not yet contacted</span>
                )}
              </div>
              <div className={styles.accountActions}>
                <button type="button" onClick={() => setSelected(d.id)}>
                  {selected === d.id ? 'Selected' : 'Record outcome'}
                </button>
              </div>
            </li>
          ))}
          {doctors.length === 0 && <li className={styles.account}>No doctors found.</li>}
        </ul>

        {selected && (
          <Card style={{ marginTop: '1rem' }}>
            <form onSubmit={recordConsent} className={styles.createForm} style={{ gridTemplateColumns: '1fr 1fr auto' }}>
              <Input
                label="Contacted via"
                value={contactedVia}
                onChange={(e) => setContactedVia(e.target.value)}
                placeholder="e.g. phone call 2026-07-26"
              />
              <Dropdown
                label="Outcome"
                value={status}
                onChange={(e) => setStatus(e.target.value as ConsentStatus)}
                options={[
                  { value: 'pending', label: 'Pending — contacted, awaiting reply' },
                  { value: 'approved', label: 'Approved — consents to attribution' },
                  { value: 'denied', label: 'Denied — declines attribution' },
                ]}
              />
              <Button type="submit">Save</Button>
              {status === 'denied' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <Input
                    label="Denial reason (optional)"
                    value={denialReason}
                    onChange={(e) => setDenialReason(e.target.value)}
                  />
                </div>
              )}
            </form>
            {error && <p className={styles.error}>{error}</p>}
            {message && <p style={{ color: 'var(--color-green)' }}>{message}</p>}
          </Card>
        )}
      </section>
    </DevShell>
  );
}
