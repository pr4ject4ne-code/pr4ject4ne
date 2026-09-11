'use client';

import { useState } from 'react';
import Button from './Button';
import type { Coords } from '@/lib/geolocation';
import styles from './AddressLocator.module.css';

/**
 * Item 5 — "paste a Google Maps link or address" input that resolves to
 * coordinates via POST /api/resolve-location, instead of a dev/hospital
 * staff member having to hunt down exact latitude/longitude themselves.
 * Deliberately NOT a replacement for LocationPicker — this just fills in
 * lat/lng, the same way typing them by hand does; the pin still shows on
 * the map below and can still be fine-tuned by dragging.
 */
export default function AddressLocator({ onResolved }: { onResolved: (coords: Coords) => void }) {
  const [input, setInput] = useState('');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    if (!input.trim()) return;
    setResolving(true);
    setError(null);
    try {
      const res = await fetch('/api/resolve-location', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not resolve that.');
      onResolved({ lat: data.lat, lng: data.lng });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve that.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className={styles.row}>
      <input
        type="text"
        placeholder="Paste a Google Maps link, or type an address…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            resolve();
          }
        }}
        aria-label="Google Maps link or address"
        className={styles.input}
      />
      <Button type="button" variant="ghost" onClick={resolve} disabled={resolving || !input.trim()}>
        {resolving ? 'Locating…' : 'Locate'}
      </Button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
