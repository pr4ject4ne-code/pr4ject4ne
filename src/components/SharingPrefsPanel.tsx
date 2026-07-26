'use client';

import { useState } from 'react';
import Card from './Card';
import Button from './Button';
import { SHARING_PREF_KEYS, DEFAULT_SHARING_PREFS } from '@/lib/sharing-prefs';
import type { SharingPrefs } from '@/types';
import styles from './SharingPrefsPanel.module.css';

const LABELS: Record<keyof SharingPrefs, { title: string; hint: string }> = {
  profile: {
    title: 'Profile',
    hint: 'Name, alias, gender, phone, email, date of birth, next of kin, address, photo.',
  },
  demographics: {
    title: 'Demographics',
    hint: 'Occupation, marital status, religious status, tribe, ethnicity.',
  },
  anthropometrics: {
    title: 'Measurements',
    hint: 'Height, weight, waist/chest/hip circumference, BMI.',
  },
  chronic_disease: {
    title: 'Chronic disease',
    hint: 'Your free-text chronic disease note.',
  },
  genotype: {
    title: 'Genotype',
    hint: 'Your recorded genotype.',
  },
  blood_group: {
    title: 'Blood group',
    hint: 'Your recorded blood group.',
  },
  disability: {
    title: 'Disability',
    hint: 'Any recorded disability.',
  },
  health_preferences: {
    title: 'Health preferences',
    hint: 'Notes on care/treatment preferences.',
  },
  clinical_conditions: {
    title: 'Clinical conditions',
    hint: 'Timestamped condition history (cause, duration, progression, complication, care).',
  },
};

interface SharingPrefsPanelProps {
  value: SharingPrefs;
  onSave: (next: SharingPrefs) => Promise<void> | void;
  saving?: boolean;
}

/**
 * Worklist #23 — lets the account holder pick which biodata sections become
 * readable by ANYONE who supplies their correct IHN code. Default-deny: every
 * toggle starts off; nothing is shared until explicitly opted in here. Reuses
 * the existing checkbox-row pattern from HospitalDashboardClient's
 * `show_doctors` toggle (worklist #10) rather than inventing new UI language.
 */
export default function SharingPrefsPanel({ value, onSave, saving }: SharingPrefsPanelProps) {
  const [draft, setDraft] = useState<SharingPrefs>({ ...DEFAULT_SHARING_PREFS, ...value });
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function toggle(key: keyof SharingPrefs) {
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
    setSavedAt(null);
  }

  async function handleSave() {
    await onSave(draft);
    setSavedAt(Date.now());
  }

  return (
    <Card className={styles.panel}>
      <h3 className={styles.title}>What&apos;s visible via your IHN code</h3>
      <p className={styles.intro}>
        Anyone with the correct IHN code can look up your record, but they can only see the
        sections you turn on below. Everything starts off — nothing is shared until you choose to
        share it.
      </p>
      <div className={styles.list}>
        {SHARING_PREF_KEYS.map((key) => (
          <label key={key} className={styles.row}>
            <input type="checkbox" checked={draft[key]} onChange={() => toggle(key)} />
            <span>
              <span className={styles.rowTitle}>{LABELS[key].title}</span>
              <span className={styles.rowHint}>{LABELS[key].hint}</span>
            </span>
          </label>
        ))}
      </div>
      <Button type="button" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save sharing settings'}
      </Button>
      {savedAt && (
        <p className={styles.saved} role="status">
          Saved.
        </p>
      )}
    </Card>
  );
}
