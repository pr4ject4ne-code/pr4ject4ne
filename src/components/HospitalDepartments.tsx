'use client';

import { useState } from 'react';
import Link from 'next/link';
import Card from './Card';
import Button from './Button';
import Stars from './Stars';
import StarsInput from './StarsInput';
import ErrorBubble from './ErrorBubble';
import type { HospitalDepartment } from '@/types';
import styles from './HospitalDepartments.module.css';

export interface DepartmentAggregate {
  avg: number;
  count: number;
  staff_avg: number;
  service_avg: number;
  infrastructure_avg: number;
}

export interface YourDepartmentRating {
  staff_score: number;
  service_score: number;
  infrastructure_score: number;
  review: string | null;
}

export interface DepartmentRatingSubmission {
  staffScore: number;
  serviceScore: number;
  infrastructureScore: number;
  review: string | null;
}

interface HospitalDepartmentsProps {
  departments: HospitalDepartment[];
  /** Per-department aggregate, keyed by department id — the "in-depth"
   * 3-axis composite (item 8). A missing key or a zero count both render as
   * "No ratings yet". */
  ratings?: Record<string, DepartmentAggregate>;
  /** The signed-in patient's own 3-axis rating per department, keyed by
   * department id. `null` means signed out. */
  yourRatings?: Record<string, YourDepartmentRating> | null;
  onRate?: (departmentId: string, submission: DepartmentRatingSubmission) => Promise<void>;
}

/** Public display of a hospital's departments, their services, and the
 * per-department "in-depth" 3-axis rating (item 8 — staff/individuals,
 * service, infrastructure, each weighted equally into one composite). */
export default function HospitalDepartments({
  departments,
  ratings = {},
  yourRatings = null,
  onRate,
}: HospitalDepartmentsProps) {
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { staff: number; service: number; infrastructure: number; review: string }>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [rateErrors, setRateErrors] = useState<Record<string, string | null>>({});

  if (departments.length === 0) return null;

  function draftFor(deptId: string) {
    if (drafts[deptId]) return drafts[deptId]!;
    const existing = yourRatings?.[deptId];
    return {
      staff: existing?.staff_score ?? 0,
      service: existing?.service_score ?? 0,
      infrastructure: existing?.infrastructure_score ?? 0,
      review: existing?.review ?? '',
    };
  }

  function setDraft(deptId: string, patch: Partial<{ staff: number; service: number; infrastructure: number; review: string }>) {
    setDrafts((prev) => ({ ...prev, [deptId]: { ...draftFor(deptId), ...patch } }));
  }

  async function submitRating(departmentId: string) {
    if (!onRate) return;
    const draft = draftFor(departmentId);
    if (!draft.staff || !draft.service || !draft.infrastructure) {
      setRateErrors((prev) => ({ ...prev, [departmentId]: 'Please rate all three: staff, service, and infrastructure.' }));
      return;
    }
    setSavedId(null);
    setRateErrors((prev) => ({ ...prev, [departmentId]: null }));
    setPendingId(departmentId);
    try {
      await onRate(departmentId, {
        staffScore: draft.staff,
        serviceScore: draft.service,
        infrastructureScore: draft.infrastructure,
        review: draft.review.trim() || null,
      });
      setSavedId(departmentId);
      setExpandedId(null);
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
            const isPending = pendingId === dept.id;
            const isSaved = savedId === dept.id;
            const isExpanded = expandedId === dept.id;
            const draft = draftFor(dept.id);
            const alreadyRated = yourRatings?.[dept.id] != null;

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
                    <span className={styles.ratingSummary}>
                      <Stars value={agg.avg} count={agg.count} />
                      <span className={styles.axisBreakdown}>
                        Staff {agg.staff_avg.toFixed(1)} · Service {agg.service_avg.toFixed(1)} · Infrastructure{' '}
                        {agg.infrastructure_avg.toFixed(1)}
                      </span>
                    </span>
                  ) : (
                    <span className={styles.muted}>No ratings yet</span>
                  )}

                  {yourRatings === null ? (
                    <Link href="/login" className={styles.signInLink}>
                      Sign in to rate this department
                    </Link>
                  ) : !isExpanded ? (
                    <button type="button" className={styles.signInLink} onClick={() => setExpandedId(dept.id)}>
                      {alreadyRated ? 'Edit your in-depth rating' : 'Leave an in-depth rating'}
                    </button>
                  ) : null}
                  {!isPending && isSaved && <span className={styles.ratingStatus}>Saved!</span>}
                </div>

                {isExpanded && (
                  <div className={styles.rateForm}>
                    <label className={styles.axisRow}>
                      <span>Staff / individuals</span>
                      <StarsInput value={draft.staff} disabled={isPending} onSelect={(s) => setDraft(dept.id, { staff: s })} />
                    </label>
                    <label className={styles.axisRow}>
                      <span>Service</span>
                      <StarsInput value={draft.service} disabled={isPending} onSelect={(s) => setDraft(dept.id, { service: s })} />
                    </label>
                    <label className={styles.axisRow}>
                      <span>Infrastructure</span>
                      <StarsInput
                        value={draft.infrastructure}
                        disabled={isPending}
                        onSelect={(s) => setDraft(dept.id, { infrastructure: s })}
                      />
                    </label>
                    <textarea
                      className={styles.reviewInput}
                      placeholder="Optional: write a review of this department…"
                      value={draft.review}
                      disabled={isPending}
                      onChange={(e) => setDraft(dept.id, { review: e.target.value })}
                      rows={3}
                    />
                    <div className={styles.rateFormActions}>
                      <Button type="button" onClick={() => submitRating(dept.id)} disabled={isPending}>
                        {isPending ? 'Saving…' : 'Submit rating'}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setExpandedId(null)} disabled={isPending}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                <ErrorBubble variant="field" message={rateErrors[dept.id]} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
