'use client';

import { useMemo, useState } from 'react';
import Card from './Card';
import type { Announcement } from '@/types';
import styles from './AnnouncementCalendar.module.css';

const COLOR_RANK: Record<string, number> = { red: 3, yellow: 2, green: 1 };

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function AnnouncementCalendar({ announcements }: { announcements: Announcement[] }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);

  // Group announcements by date and compute the top-priority color per day.
  const byDate = useMemo(() => {
    const map = new Map<string, Announcement[]>();
    for (const a of announcements) {
      if (!a.event_date) continue;
      const key = a.event_date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [announcements]);

  // The announcement bar: explicit is_bar, else highest priority / most recent.
  const barAnnouncement = useMemo(() => {
    const flagged = announcements.find((a) => a.is_bar);
    if (flagged) return flagged;
    return [...announcements].sort((a, b) => {
      const c = (COLOR_RANK[b.color] ?? 0) - (COLOR_RANK[a.color] ?? 0);
      if (c !== 0) return c;
      return (b.event_date ?? b.created_at).localeCompare(a.event_date ?? a.created_at);
    })[0];
  }, [announcements]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ day: d, date: ymd(new Date(year, month, d)) });
  }

  const selectedItems = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <Card as="section">
      {barAnnouncement && (
        <div className={`${styles.bar} ${styles[`bar_${barAnnouncement.color}`]}`} role="status">
          <strong>{barAnnouncement.title}</strong>
          {barAnnouncement.body ? ` — ${barAnnouncement.body}` : ''}
        </div>
      )}

      <div className={styles.calHeader}>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h2 className={styles.monthLabel}>{monthLabel}</h2>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className={styles.grid} role="grid" aria-label={`Announcements for ${monthLabel}`}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className={styles.weekday} role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} className={styles.empty} />;
          const items = byDate.get(cell.date);
          const topColor = items
            ? items.reduce(
                (best, a) =>
                  (COLOR_RANK[a.color] ?? 0) > (COLOR_RANK[best] ?? 0) ? a.color : best,
                'green',
              )
            : null;
          return (
            <button
              key={cell.date}
              type="button"
              role="gridcell"
              className={`${styles.day} ${selected === cell.date ? styles.selected : ''}`}
              onClick={() => setSelected(cell.date)}
              aria-label={items ? `${cell.day}, ${items.length} announcement(s)` : String(cell.day)}
            >
              <span>{cell.day}</span>
              {topColor && <span className={`${styles.dot} ${styles[`dot_${topColor}`]}`} />}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className={styles.detail}>
          <h3 className={styles.detailTitle}>{selected}</h3>
          {selectedItems.length === 0 ? (
            <p className={styles.muted}>No announcements on this date.</p>
          ) : (
            <ul className={styles.detailList}>
              {selectedItems.map((a) => (
                <li key={a.id} className={styles.detailItem}>
                  <span className={`${styles.tag} ${styles[`tag_${a.color}`]}`}>{a.color}</span>
                  <div>
                    <strong>{a.title}</strong>
                    {a.body && <p>{a.body}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
