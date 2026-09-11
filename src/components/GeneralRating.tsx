'use client';

import { useState } from 'react';
import Link from 'next/link';
import Card from './Card';
import Button from './Button';
import Stars from './Stars';
import StarsInput from './StarsInput';
import ErrorBubble from './ErrorBubble';
import styles from './GeneralRating.module.css';

export interface GeneralRatingSummary {
  avg: number;
  count: number;
}
export interface YourGeneralRating {
  score: number;
  review: string | null;
}

interface GeneralRatingProps {
  summary: GeneralRatingSummary;
  /** undefined = signed out (or not yet loaded); null = signed in but hasn't
   *  rated yet; an object = their existing rating. */
  yourRating?: YourGeneralRating | null;
  onSubmit?: (score: number, review: string | null) => Promise<void>;
}

/**
 * Item 8's "general" (overall, per-hospital) rating — separate from the
 * per-department in-depth breakdown (HospitalDepartments.tsx). One score +
 * an optional review per patient, editable any time.
 */
export default function GeneralRating({ summary, yourRating, onSubmit }: GeneralRatingProps) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(yourRating?.score ?? 0);
  const [review, setReview] = useState(yourRating?.review ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!onSubmit || !score) {
      if (!score) setError('Please choose a star rating.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(score, review.trim() || null);
      setSaved(true);
      setOpen(false);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Could not save your rating. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card variant="plain" as="section">
      <h2 className={styles.title}>Overall rating</h2>
      <div className={styles.row}>
        {summary.count > 0 ? (
          <Stars value={summary.avg} count={summary.count} />
        ) : (
          <span className={styles.muted}>No ratings yet</span>
        )}

        {yourRating === undefined ? (
          <Link href="/login" className={styles.link}>
            Sign in to rate this hospital
          </Link>
        ) : !open ? (
          <button type="button" className={styles.link} onClick={() => setOpen(true)}>
            {yourRating ? 'Edit your rating' : 'Rate this hospital'}
          </button>
        ) : null}
        {saved && <span className={styles.status}>Saved!</span>}
      </div>

      {open && (
        <div className={styles.form}>
          <StarsInput value={score} disabled={saving} onSelect={setScore} />
          <textarea
            className={styles.reviewInput}
            placeholder="Optional: write a review…"
            value={review}
            disabled={saving}
            onChange={(e) => setReview(e.target.value)}
            rows={3}
          />
          <div className={styles.actions}>
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : 'Submit rating'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
          <ErrorBubble variant="field" message={error} />
        </div>
      )}
    </Card>
  );
}
