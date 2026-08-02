'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SYMPTOM_REGIONS, SYMPTOM_ITEMS } from '@/lib/symptom-specialty-map';
import { RED_FLAG_SYMPTOMS, evaluateRedFlagGate, MAX_SEVERITY } from '@/lib/symptom-red-flags';
import { keepFocusedElementVisible } from '@/lib/keyboardSafeScroll';
import styles from './SearchBar.module.css';

export type SearchMode = 'nearest' | 'hospital' | 'symptom';

interface SearchBarProps {
  /** When set, the search bar is hospital-specific and calls this instead of navigating. */
  onHospitalSearch?: (query: string) => void;
}

const MODE_PLACEHOLDER: Record<SearchMode, string> = {
  nearest: 'Find the nearest hospital…',
  hospital: 'Search hospitals by name…',
  symptom: 'Describe your symptoms…',
};

const MODE_OPTIONS: { value: SearchMode; label: string }[] = [
  { value: 'nearest', label: 'Nearby' },
  { value: 'hospital', label: 'By name' },
  { value: 'symptom', label: 'By symptom' },
];

export default function SearchBar({ onHospitalSearch }: SearchBarProps) {
  const [mode, setMode] = useState<SearchMode>('nearest');
  const [q, setQ] = useState('');
  const [symptomIds, setSymptomIds] = useState<string[]>([]);
  const [redFlagIds, setRedFlagIds] = useState<string[]>([]);
  const [severity, setSeverity] = useState<number | null>(null);
  const [symptomPickerOpen, setSymptomPickerOpen] = useState(false);
  const router = useRouter();
  // Releases the visual-viewport watcher started on focus (see
  // lib/keyboardSafeScroll.ts): on a phone, the on-screen keyboard opening
  // AFTER focus is what can leave the input off-screen or under the sticky
  // header, so the watcher has to outlive the focus event itself.
  const releaseFocusScroll = useRef<(() => void) | null>(null);

  function onInputFocus(e: React.FocusEvent<HTMLInputElement>) {
    releaseFocusScroll.current?.();
    releaseFocusScroll.current = keepFocusedElementVisible(e.currentTarget);
  }

  function onInputBlur() {
    releaseFocusScroll.current?.();
    releaseFocusScroll.current = null;
  }

  // Unmounting while still focused (e.g. navigating away on submit) must not
  // leave the listener attached to the shared visualViewport object.
  useEffect(() => () => releaseFocusScroll.current?.(), []);

  const isSymptomMode = mode === 'symptom' && !onHospitalSearch;
  // Stage 1 red-flag gate (symptom-red-flags.ts) — evaluated purely
  // client-side here so the Search button/copy can reflect it immediately;
  // the actual short-circuit (skip Stage 2 specialty routing entirely)
  // happens on submit below and again, redundantly, wherever the emergency
  // outcome is rendered.
  const redFlagGate = evaluateRedFlagGate({ selectedRedFlagIds: redFlagIds, severity });
  // Nothing selected yet and severity not raised — nothing to search for.
  const symptomSearchBlocked =
    isSymptomMode && !redFlagGate.isEmergency && symptomIds.length === 0;
  const totalSymptomSelections = symptomIds.length + redFlagIds.length;

  function toggleSymptom(id: string) {
    setSymptomIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function toggleRedFlag(id: string) {
    setRedFlagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function selectMode(next: SearchMode) {
    setMode(next);
    setSymptomPickerOpen(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (onHospitalSearch) {
      onHospitalSearch(q);
      return;
    }
    if (isSymptomMode) {
      // Stage 1 ALWAYS runs first, regardless of anything else selected —
      // never proceed to Stage 2 specialty routing when it fires.
      if (redFlagGate.isEmergency) {
        router.push('/?emergency=1');
        return;
      }
      if (symptomIds.length === 0) return;
      const params = new URLSearchParams();
      params.set('symptom', symptomIds.join(','));
      router.push(`/?${params.toString()}`);
      return;
    }
    const params = new URLSearchParams();
    if (mode === 'hospital' && q) params.set('q', q);
    if (mode === 'nearest') params.set('nearest', '1');
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className={styles.searchWrap}>
      <form className={styles.searchPill} onSubmit={onSubmit} role="search">
        {!onHospitalSearch && (
          <div className={styles.modeGroup} role="group" aria-label="Search mode">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={mode === opt.value ? styles.modePillOn : styles.modePill}
                aria-pressed={mode === opt.value}
                onClick={() => selectMode(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {isSymptomMode ? (
          <button
            type="button"
            className={styles.symptomToggle}
            aria-haspopup="true"
            aria-expanded={symptomPickerOpen}
            onClick={() => setSymptomPickerOpen((o) => !o)}
          >
            {redFlagGate.isEmergency
              ? 'Emergency, tap Search'
              : totalSymptomSelections > 0
                ? `${totalSymptomSelections} selected`
                : 'Describe your symptoms…'}
          </button>
        ) : (
          <input
            className={styles.searchInput}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
            placeholder={onHospitalSearch ? 'Search this hospital…' : MODE_PLACEHOLDER[mode]}
            aria-label="Search"
          />
        )}
        <button type="submit" className={styles.searchBtn} disabled={symptomSearchBlocked}>
          Search
        </button>
      </form>
      {isSymptomMode && symptomPickerOpen && (
        <div className={styles.symptomPanel} role="group" aria-label="Describe your symptoms">
          <div className={styles.severityBlock}>
            <label htmlFor="symptom-severity" className={styles.severityLabel}>
              How severe does it feel right now? (0 = mild, {MAX_SEVERITY} = worst pain
              imaginable)
            </label>
            <input
              id="symptom-severity"
              type="range"
              min={0}
              max={MAX_SEVERITY}
              step={1}
              value={severity ?? 0}
              onChange={(e) => setSeverity(Number(e.target.value))}
              className={styles.severitySlider}
            />
            <span className={styles.severityValue} aria-live="polite">
              {severity ?? 0}/{MAX_SEVERITY}
            </span>
          </div>
          <p className={styles.redFlagLabel}>Is any of this happening right now?</p>
          <div className={styles.redFlagGroup}>
            {RED_FLAG_SYMPTOMS.map((rf) => {
              const on = redFlagIds.includes(rf.id);
              return (
                <button
                  key={rf.id}
                  type="button"
                  aria-pressed={on}
                  className={on ? styles.redFlagChipOn : styles.redFlagChip}
                  onClick={() => toggleRedFlag(rf.id)}
                >
                  {rf.label}
                </button>
              );
            })}
          </div>
          {redFlagGate.isEmergency ? (
            <p className={styles.emergencyHint} role="alert">
              This may be an emergency. Press Search for urgent guidance, or call 112 / go to the
              nearest hospital now.
            </p>
          ) : (
            <>
              {SYMPTOM_REGIONS.map((region) => (
                <div key={region} className={styles.symptomRegionGroup}>
                  <p className={styles.symptomRegionLabel}>{region}</p>
                  <div className={styles.symptomRegionChips}>
                    {SYMPTOM_ITEMS.filter((s) => s.region === region).map((s) => {
                      const on = symptomIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={on}
                          className={on ? styles.symptomChipOn : styles.symptomChip}
                          onClick={() => toggleSymptom(s.id)}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className={styles.symptomHint} aria-live="polite">
                This is based on which services hospitals list, not an assessment of your
                condition, never a diagnosis. If you think this is an emergency, call 112 or go to
                the nearest hospital now.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
