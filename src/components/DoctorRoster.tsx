'use client';

import { useMemo, useState } from 'react';
import Card from './Card';
import Stars from './Stars';
import type { Doctor } from '@/types';
import styles from './DoctorRoster.module.css';

const LEVEL_LABEL: Record<string, string> = {
  consultant: 'Consultant',
  senior_registrar: 'Senior Registrar',
  registrar: 'Registrar',
  intern: 'Intern',
  other: 'Other',
};

export default function DoctorRoster({ doctors }: { doctors: Doctor[] }) {
  const [open, setOpen] = useState(true);
  const [specialty, setSpecialty] = useState('');
  const [sortAlpha, setSortAlpha] = useState(true);

  const specialties = useMemo(
    () => Array.from(new Set(doctors.map((d) => d.specialty).filter(Boolean))) as string[],
    [doctors],
  );

  const visible = useMemo(() => {
    let list = specialty ? doctors.filter((d) => d.specialty === specialty) : doctors;
    list = [...list].sort((a, b) =>
      sortAlpha ? a.name.localeCompare(b.name) : b.rating_avg - a.rating_avg,
    );
    return list;
  }, [doctors, specialty, sortAlpha]);

  return (
    <Card as="section">
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <h2 className={styles.title}>Doctors ({doctors.length})</h2>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <>
          <div className={styles.filters}>
            <label className={styles.filterLabel}>
              <span className="sr-only">Filter by specialty</span>
              <select
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                aria-label="Filter by specialty"
              >
                <option value="">All specialties</option>
                {specialties.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.sortToggle} role="group" aria-label="Sort doctors">
              <button
                type="button"
                className={sortAlpha ? styles.activeSort : ''}
                onClick={() => setSortAlpha(true)}
              >
                A–Z
              </button>
              <button
                type="button"
                className={!sortAlpha ? styles.activeSort : ''}
                onClick={() => setSortAlpha(false)}
              >
                Top rated
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className={styles.muted}>No doctors listed.</p>
          ) : (
            <ul className={styles.list}>
              {visible.map((d) => (
                <li key={d.id} className={styles.doctor}>
                  <div>
                    <span className={styles.name}>{d.name}</span>
                    <span className={styles.meta}>
                      {[d.specialty, d.level ? (LEVEL_LABEL[d.level] ?? d.level) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  {d.rating_count > 0 ? (
                    <Stars value={d.rating_avg} count={d.rating_count} />
                  ) : (
                    <span className={styles.noRating}>No ratings</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
