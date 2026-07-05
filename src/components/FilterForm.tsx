'use client';

import Button from './Button';
import type { FilterParams } from '@/lib/filter-search';
import styles from './FilterForm.module.css';

const SERVICE_TYPES = [
  { value: '', label: 'All service types' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'radiology', label: 'Radiology / imaging' },
  { value: 'other', label: 'Other' },
];

interface FilterFormProps {
  value: FilterParams;
  onChange: (next: FilterParams) => void;
  onSubmit: () => void;
}

export default function FilterForm({ value, onChange, onSubmit }: FilterFormProps) {
  function update(patch: Partial<FilterParams>) {
    onChange({ ...value, ...patch });
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.field}>
        <label htmlFor="f-service">Service type</label>
        <select
          id="f-service"
          value={value.serviceType ?? ''}
          onChange={(e) => update({ serviceType: e.target.value })}
        >
          {SERVICE_TYPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="f-location">Location</label>
        <input
          id="f-location"
          type="text"
          value={value.location ?? ''}
          onChange={(e) => update({ location: e.target.value })}
          placeholder="City or area"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="f-specialty">Specialty / service</label>
        <input
          id="f-specialty"
          type="text"
          value={value.specialty ?? ''}
          onChange={(e) => update({ specialty: e.target.value })}
          placeholder="e.g. Cardiology"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="f-rating">Minimum rating: {value.minRating ?? 0}★</label>
        <input
          id="f-rating"
          type="range"
          min={0}
          max={5}
          step={1}
          value={value.minRating ?? 0}
          onChange={(e) => update({ minRating: Number(e.target.value) })}
        />
      </div>

      <div className={styles.checkboxField}>
        <input
          id="f-open24"
          type="checkbox"
          checked={value.open24 ?? false}
          onChange={(e) => update({ open24: e.target.checked })}
        />
        <label htmlFor="f-open24">Open 24 hours</label>
      </div>

      <Button type="submit" className={styles.apply}>
        Apply filters
      </Button>
    </form>
  );
}
