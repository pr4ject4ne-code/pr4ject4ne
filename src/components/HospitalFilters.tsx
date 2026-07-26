'use client';

import styles from './HospitalFilters.module.css';

export interface HomeFilterValue {
  ownership: 'private' | 'public' | '';
  minRating: number;
  openDay: string;
  radiusKm: number | '';
}

export const DEFAULT_HOME_FILTERS: HomeFilterValue = {
  ownership: '',
  minRating: 0,
  openDay: '',
  radiusKm: '',
};

const DAYS = [
  { value: '', label: 'Any day' },
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

interface HospitalFiltersProps {
  value: HomeFilterValue;
  onChange: (next: HomeFilterValue) => void;
  /** Distance filter needs a known location to measure from. */
  hasLocation: boolean;
}

/**
 * Compact filter controls for the homepage results panel (worklist #13).
 * `FilterForm.tsx` (the `/filter` directory page) is built for a full-width
 * dedicated filter page with an "Apply filters" submit step — too heavy for
 * this panel, which is a narrow docked sidebar on desktop and a bottom sheet
 * on mobile, and where filters should apply live rather than via a separate
 * submit. This reuses the same visual language (labels + native inputs,
 * `Card.module.css`-consistent glass tokens) in a denser, always-live layout.
 */
export default function HospitalFilters({ value, onChange, hasLocation }: HospitalFiltersProps) {
  function update(patch: Partial<HomeFilterValue>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className={styles.filters}>
      <div className={styles.row}>
        <span className={styles.label}>Ownership</span>
        <div className={styles.segmented} role="group" aria-label="Ownership">
          {(
            [
              { value: '', label: 'Any' },
              { value: 'public', label: 'Public' },
              { value: 'private', label: 'Private' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={value.ownership === opt.value ? styles.segActive : styles.seg}
              aria-pressed={value.ownership === opt.value}
              onClick={() => update({ ownership: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <label className={styles.label} htmlFor="hf-rating">
          Minimum rating: {value.minRating > 0 ? `${value.minRating}★` : 'Any'}
        </label>
        <input
          id="hf-rating"
          type="range"
          min={0}
          max={5}
          step={1}
          value={value.minRating}
          onChange={(e) => update({ minRating: Number(e.target.value) })}
        />
      </div>

      <div className={styles.row}>
        <label className={styles.label} htmlFor="hf-day">
          Open on
        </label>
        <select
          id="hf-day"
          value={value.openDay}
          onChange={(e) => update({ openDay: e.target.value })}
        >
          {DAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <label className={styles.label} htmlFor="hf-radius">
          Within {value.radiusKm ? `${value.radiusKm} km` : 'any distance'}
        </label>
        <input
          id="hf-radius"
          type="range"
          min={0}
          max={50}
          step={5}
          disabled={!hasLocation}
          value={value.radiusKm || 0}
          onChange={(e) => {
            const km = Number(e.target.value);
            update({ radiusKm: km > 0 ? km : '' });
          }}
        />
        {!hasLocation && (
          <p className={styles.hint}>Share your location (“Nearest”) to filter by distance.</p>
        )}
      </div>
    </div>
  );
}
