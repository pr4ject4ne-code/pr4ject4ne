'use client';

import { useState } from 'react';
import Link from 'next/link';
import Card from './Card';
import Stars from './Stars';
import StarsInput from './StarsInput';
import ErrorBubble from './ErrorBubble';
import type { HospitalDepartment } from '@/types';
import styles from './HospitalDepartments.module.css';

interface RatingAggregate {
  avg: number;
  count: number;
}

interface HospitalDepartmentsProps {
  departments: HospitalDepartment[];
  /** Per-department aggregate rating, keyed by department id. A missing key
   * or a zero count both render as "No ratings yet". */
  ratings?: Record<string, RatingAggregate>;
  /** The signed-in patient's own score per department, keyed by department
   * id. `null` means signed out — shows a sign-in prompt instead of an
   * input. A present object missing a given department's key means signed
   * in but that department hasn't been rated yet (renders an empty input). */
  yourRatings?: Record<string, number> | null;
  /** Called with (departmentId, score) when the caller picks a star rating.
   * Only relevant/rendered when signed in (yourRatings is non-null). */
  onRate?: (departmentId: string, score: number) => Promise<void>;
}

/** Public display of a hospital's departments, their services, and
 * per-department ratings (worklist #14; ratings: Racoon Eye v1 Phase 2). */
export default function HospitalDepartments({
  departments,
  ratings = {},
  yourRatings = null,
  onRate,
}: HospitalDepartmentsProps) {
  const [open, setOpen] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [rateErrors, setRateErrors] = useState<Record<string, string | null>>({});

  if (departments.length === 0) return null;

  async function handleRate(departmentId: string, score: number) {
    if (!onRate) return;
    setSavedId(null);
    setRateErrors((prev) => ({ ...prev, [departmentId]: null }));
    setPendingId(departmentId);
    try {
      await onRate(departmentId, score);
      setSavedId(departmentId);
      setTimeout(() => setSavedId((cur) => (cur === departmentId ? null : cur)), 2000);
    } catch {
      setRateErrors((prev) => ({ ...prev, [departmentId]: 'Could not save your rating. Try again.' }));
    } finally {
      setPendingId((cur) => (cur === departmentId ? null : cur));
    }
  }

  return (
    <Card variant="plain" as="section">
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <h2 className={styles.title}>Departments ({departments.length})</h2>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <ul className={styles.list}>
          {departments.map((dept) => {
            const agg = ratings[dept.id];
            const yourScore = yourRatings?.[dept.id] ?? 0;
            const isPending = pendingId === dept.id;
            const isSaved = savedId === dept.id;
            return (
              <li key={dept.id} className={styles.dept}>
                <span className={styles.deptName}>{dept.name}</span>
                {dept.services.length > 0 ? (
                  <ul className={styles.services}>
                    {dept.services.map((service, j) => (
                      <li key={j} className={styles.service}>
                        {service}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>No services listed under this department.</p>
                )}

                <div className={styles.ratingRow}>
                  {agg && agg.count > 0 ? (
                    <Stars value={agg.avg} count={agg.count} />
                  ) : (
                    <span className={styles.muted}>No ratings yet</span>
                  )}

                  {yourRatings === null ? (
                    <Link href="/login" className={styles.signInLink}>
                      Sign in to rate this department
                    </Link>
                  ) : (
                    <span className={styles.rateWrap}>
                      <StarsInput
                        value={yourScore}
                        disabled={isPending}
                        onSelect={(score) => handleRate(dept.id, score)}
                      />
                      {isPending && <span className={styles.ratingStatus}>Saving…</span>}
                      {!isPending && isSaved && <span className={styles.ratingStatus}>Saved!</span>}
                    </span>
                  )}
                </div>
                <ErrorBubble variant="field" message={rateErrors[dept.id]} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
