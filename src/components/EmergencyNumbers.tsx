'use client';

import { useState } from 'react';
import Dropdown from './Dropdown';
import Card from './Card';
import { EMERGENCY_NUMBERS } from '@/lib/emergency-numbers';
import styles from './EmergencyNumbers.module.css';

/**
 * Item 3: country-scoped emergency numbers via a scroll-down (native
 * <select>, i.e. Dropdown) selector, rather than hardcoding Nigeria's 112
 * everywhere. No country is pre-selected — defaulting to Nigeria would just
 * re-introduce the bias this feature exists to remove.
 */
export default function EmergencyNumbers() {
  const [code, setCode] = useState('');
  const selected = EMERGENCY_NUMBERS.find((c) => c.code === code) ?? null;

  return (
    <Card as="section" variant="plain">
      <h2 className={styles.heading}>Emergency numbers</h2>
      <p className={styles.intro}>Select your country to find its emergency number.</p>
      <Dropdown
        label="Country"
        placeholder="Select your country…"
        options={EMERGENCY_NUMBERS.map((c) => ({ value: c.code, label: c.country }))}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {selected && (
        <div className={styles.result}>
          <p className={styles.number}>{selected.number}</p>
          <p className={styles.note}>
            If this is a single tappable number, dial it directly; where two numbers are listed, choose the one
            for your situation (e.g. ambulance vs. police).
          </p>
        </div>
      )}
      <p className={styles.disclaimer}>
        These numbers are provided as a general reference and may change. If you&apos;re unsure, contact your local
        police or a trusted local source to confirm before an emergency happens.
      </p>
    </Card>
  );
}
