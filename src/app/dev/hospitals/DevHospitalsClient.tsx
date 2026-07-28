'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DevShell from '../DevShell';
import { useDevGuard } from '../useDevGuard';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Dropdown from '@/components/Dropdown';
import Button from '@/components/Button';
import LocationPicker from '@/components/LocationPicker';
import { authFetch } from '@/lib/authFetch';
import type { Coords } from '@/lib/geolocation';
import type { Hospital, ServiceType } from '@/types';
import styles from '../primary/DevPrimary.module.css';

const SERVICE_TYPE_OPTIONS: Array<{ value: ServiceType; label: string }> = [
  { value: 'hospital', label: 'Hospital' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'radiology', label: 'Radiology' },
  { value: 'other', label: 'Other' },
];

/**
 * Dev/admin hospital creation + pending-review moderation (worklist #36).
 * Two sections: (1) review self-registered hospitals awaiting approval, with
 * approve/reject; (2) create a hospital directly on an institution's behalf
 * (lands approved immediately, still unverified — see /api/dev/hospitals'
 * own comment for the approved-vs-verified distinction). After either
 * action, the handover to grant VERIFIED status is a separate, deliberate
 * step at /dev/institutions (create the hospital's first tertiary account) —
 * linked here rather than folded in, per the founder's framing of these as
 * two related but distinct actions.
 */
export default function DevHospitalsClient() {
  const { loading, dev } = useDevGuard();
  const [pending, setPending] = useState<Hospital[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const res = await authFetch('/api/dev/hospitals?status=pending&limit=200', undefined, {
      onUnauthenticated: setError,
    });
    if (res.status === 401) return;
    if (res.ok) setPending((await res.json()).hospitals ?? []);
  }, []);

  useEffect(() => {
    if (!loading && dev) loadPending();
  }, [loading, dev, loadPending]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

  async function moderate(id: string, action: 'approve' | 'reject') {
    setError(null);
    const res = await authFetch(
      '/api/dev/hospitals',
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
      setError(data.error ?? 'Could not update hospital.');
      return;
    }
    flash(action === 'approve' ? 'Hospital approved.' : 'Hospital rejected.');
    if (action === 'approve') setLastCreatedId(id);
    loadPending();
  }

  if (loading) {
    return (
      <DevShell title="Hospitals" showNav={false}>
        <p>Loading…</p>
      </DevShell>
    );
  }

  return (
    <DevShell title="Hospitals" dev={dev}>
      {notice && (
        <p className={styles.temp} role="status" style={{ marginBottom: '1rem' }}>
          {notice}
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.section}>
        <h2>Pending review</h2>
        <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>
          Hospitals self-registered from the public site, awaiting moderation. Approving here
          does NOT grant verified status by itself — create the institution&apos;s first tertiary
          account at{' '}
          <Link href="/dev/institutions">Institutions</Link> to hand that over.
        </p>
        {pending.length === 0 && <p>No pending hospitals.</p>}
        <ul className={styles.accountList}>
          {pending.map((h) => (
            <li key={h.id} className={styles.account}>
              <div>
                <strong>{h.name}</strong>
                <span className={styles.badge}>{h.service_type}</span>
                <div style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                  {[h.address, h.city].filter(Boolean).join(', ') || 'No address given'}
                </div>
              </div>
              <div className={styles.accountActions}>
                <button type="button" onClick={() => moderate(h.id, 'approve')}>
                  Approve
                </button>
                <button type="button" onClick={() => moderate(h.id, 'reject')}>
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
        {lastCreatedId && (
          <p className={styles.temp} style={{ marginTop: '1rem' }}>
            Approved. <Link href="/dev/institutions">Create its tertiary account →</Link>
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2>Create a hospital directly</h2>
        <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>
          Onboard an institution on its own behalf, skipping public self-registration. Lands
          approved immediately since you are vouching for it.
        </p>
        <CreateHospitalForm onCreated={(id) => { setLastCreatedId(id); flash('Hospital created.'); }} />
      </section>
    </DevShell>
  );
}

function CreateHospitalForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('hospital');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [is24Hour, setIs24Hour] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedLat = lat.trim() === '' ? null : Number(lat);
  const parsedLng = lng.trim() === '' ? null : Number(lng);

  function handlePin(coords: Coords) {
    setLat(String(coords.lat));
    setLng(String(coords.lng));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await authFetch(
      '/api/dev/hospitals',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          service_type: serviceType,
          address,
          city,
          contact_phone: phone,
          contact_email: email,
          website,
          latitude: Number.isFinite(parsedLat) ? parsedLat : undefined,
          longitude: Number.isFinite(parsedLng) ? parsedLng : undefined,
          is_24_hour: is24Hour,
          is_private: isPrivate,
        }),
      },
      { onUnauthenticated: setError },
    );
    setSubmitting(false);
    if (res.status === 401) return;
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Could not create hospital.');
      return;
    }
    onCreated(data.id);
    setName('');
    setAddress('');
    setCity('');
    setPhone('');
    setEmail('');
    setWebsite('');
    setLat('');
    setLng('');
    setIs24Hour(false);
    setIsPrivate(false);
  }

  return (
    <Card variant="plain">
      <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem' }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Dropdown
          label="Service type"
          options={SERVICE_TYPE_OPTIONS}
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as ServiceType)}
        />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />

        <div>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
            Location — click or drag the pin, or type exact coordinates
          </span>
          <LocationPicker
            lat={Number.isFinite(parsedLat) ? (parsedLat as number) : null}
            lng={Number.isFinite(parsedLng) ? (parsedLng as number) : null}
            onChange={handlePin}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <Input
              label="Latitude"
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
            <Input
              label="Longitude"
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={is24Hour} onChange={(e) => setIs24Hour(e.target.checked)} />
          Open 24 hours
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          Privately owned
        </label>

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create hospital'}
        </Button>
        {error && <p className={styles.error}>{error}</p>}
      </form>
    </Card>
  );
}
