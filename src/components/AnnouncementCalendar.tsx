'use client';

import { useMemo, useState } from 'react';
import Card from './Card';
import Modal from './Modal';
import type { Announcement, AnnouncementRecurrenceFreq } from '@/types';
import styles from './AnnouncementCalendar.module.css';

/**
 * Renamed in spirit (still `AnnouncementCalendar.tsx`/.module.css on disk to
 * avoid touching every importer) from a month calendar to a horizontal
 * chronological tab strip with a tap-to-expand overlay, per the announcement
 * rules rework: only "headlined" (within its window) announcements show at
 * all, and the whole thing renders nothing when there are none.
 */

/**
 * Client-safe mirror of lib/hospital-announcements.ts's eligibility rules.
 * Duplicated intentionally: the server lib imports `pg` via lib/db, which
 * cannot ship to the browser. Keep these two in sync if the window changes.
 */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function parseDateOnly(v: string): Date {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}
function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}
function stepOccurrence(d: Date, freq: AnnouncementRecurrenceFreq, interval: number): Date {
  const r = new Date(d);
  switch (freq) {
    case 'daily':
      r.setDate(r.getDate() + interval);
      break;
    case 'weekly':
      r.setDate(r.getDate() + interval * 7);
      break;
    case 'monthly':
      r.setMonth(r.getMonth() + interval);
      break;
    case 'yearly':
      r.setFullYear(r.getFullYear() + interval);
      break;
  }
  return r;
}
function currentOccurrenceDate(a: Announcement, now: Date): Date | null {
  const anchor = parseDateOnly(a.event_date);
  if (!a.recurrence_freq) return anchor;
  const today = atMidnight(now);
  const endDate = a.recurrence_end_date ? parseDateOnly(a.recurrence_end_date) : null;
  const floor = addDays(today, -7);
  let occurrence = anchor;
  let iterations = 0;
  while (occurrence < floor && iterations < 10_000) {
    occurrence = stepOccurrence(occurrence, a.recurrence_freq, a.recurrence_interval);
    iterations += 1;
    if (endDate && occurrence > endDate) return null;
  }
  if (endDate && occurrence > endDate) return null;
  return occurrence;
}
function isHeadlineEligible(a: Announcement, now: Date): { eligible: boolean; occurrence: Date | null } {
  const occurrence = currentOccurrenceDate(a, now);
  if (!occurrence) return { eligible: false, occurrence: null };
  const today = atMidnight(now);
  const start = addDays(occurrence, -14);
  const end = addDays(occurrence, 7);
  return { eligible: today >= start && today <= end, occurrence };
}

function recurrenceLabel(a: Announcement): string | null {
  if (!a.recurrence_freq) return null;
  const n = a.recurrence_interval;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[a.recurrence_freq];
  const every = n > 1 ? `Repeats every ${n} ${unit}s` : `Repeats every ${unit}`;
  return a.recurrence_end_date ? `${every}, through ${a.recurrence_end_date}` : every;
}

export default function AnnouncementCalendar({ announcements }: { announcements: Announcement[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const headlined = useMemo(() => {
    const now = new Date();
    return announcements
      .map((a) => ({ a, ...isHeadlineEligible(a, now) }))
      .filter((x) => x.eligible && x.occurrence)
      .sort((x, y) => {
        if (x.a.is_bar !== y.a.is_bar) return x.a.is_bar ? -1 : 1;
        return x.occurrence!.getTime() - y.occurrence!.getTime();
      });
  }, [announcements]);

  // Nothing to headline right now → show nothing at all, per spec.
  if (headlined.length === 0) return null;

  const expanded = headlined.find((x) => x.a.id === expandedId)?.a ?? null;

  return (
    <Card variant="plain" as="section">
      <div className={styles.tabStrip} role="list" aria-label="Announcements">
        {headlined.map(({ a }) => (
          <button
            key={a.id}
            type="button"
            role="listitem"
            className={`${styles.tab} ${styles[`tab_${a.color}`]}`}
            onClick={() => setExpandedId(a.id)}
          >
            <span className={styles.tabTitle}>{a.title}</span>
          </button>
        ))}
      </div>

      <Modal
        open={expanded !== null}
        onClose={() => setExpandedId(null)}
        title={expanded?.title ?? ''}
      >
        {expanded && (
          <div className={styles.detail}>
            <span className={`${styles.tag} ${styles[`tag_${expanded.color}`]}`}>{expanded.color}</span>
            <p className={styles.detailDate}>{expanded.event_date}</p>
            {expanded.body && <p>{expanded.body}</p>}
            {recurrenceLabel(expanded) && <p className={styles.muted}>{recurrenceLabel(expanded)}</p>}
          </div>
        )}
      </Modal>
    </Card>
  );
}
