'use client';

import { useState } from 'react';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Dropdown from '@/components/Dropdown';
import Button from '@/components/Button';
import LocationPicker from '@/components/LocationPicker';
import ErrorBubble from '@/components/ErrorBubble';
import type { Coords } from '@/lib/geolocation';
import type { ServiceType } from '@/types';

const SERVICE_TYPE_OPTIONS: Array<{ value: ServiceType; label: string }> = [
  { value: 'hospital', label: 'Hospital' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'radiology', label: 'Radiology' },
  { value: 'other', label: 'Other' },
];

/**
 * Public hospital self-registration (worklist #35/#36's counterpart — this
 * form didn't exist at all before; `POST /api/hospitals` was API-only). Lands
 * `status='pending'` server-side regardless of what's submitted here — this
 * form has no way to bypass moderation, that's what /dev/hospitals is for.
 */
export default function HospitalRegisterClient() {
  const [name, setName] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('hospital');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [is24Hour, setIs24Hour] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
    const res = await fetch('/api/hospitals', {
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
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? 'Could not submit your hospital.');
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <div style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
        <Card>
          <h1>Thanks — your hospital was submitted</h1>
          <p>
            It&apos;s now awaiting review by our team before it appears in search. We&apos;ll be in
            touch about next steps for verifying your listing.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <Card>
        <h1>List your hospital</h1>
        <p style={{ color: 'var(--color-muted)' }}>
          Submit your facility for review. It will appear in search once approved.
        </p>
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
              Location — click or drag the pin, or type exact coordinates if you have them
            </span>
            <LocationPicker
              lat={Number.isFinite(parsedLat) ? (parsedLat as number) : null}
              lng={Number.isFinite(parsedLng) ? (parsedLng as number) : null}
              onChange={handlePin}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
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

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for review'}
          </Button>
          <ErrorBubble variant="banner" message={error} />
        </form>
      </Card>
    </div>
  );
}
